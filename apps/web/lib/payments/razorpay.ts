import "server-only";

import {
  activateCapturedPayment,
  getWorkspacePaymentOrder,
  preparePaidPlanPurchase,
  saveRazorpayOrder,
  type PaidPlanTier,
} from "@website-audit/database";
import { getPlanDisplay } from "@website-audit/shared";
import { z } from "zod";

import type { CurrentAccount } from "../auth/current-user";
import {
  capturedPaymentMatchesOrder,
  verifyCheckoutSignature,
} from "./signatures";

const orderSchema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  receipt: z.string(),
});

const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string().nullable(),
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
});

type Credentials = {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
};

export function getRazorpayCredentials(): Credentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret) return null;
  return webhookSecret
    ? { keyId, keySecret, webhookSecret }
    : { keyId, keySecret };
}

export class CheckoutUnavailableError extends Error {
  constructor() {
    super("Online checkout is not configured yet.");
    this.name = "CheckoutUnavailableError";
  }
}

export class PaymentVerificationError extends Error {
  constructor(message = "Payment could not be verified yet.") {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

export class RazorpayServiceError extends Error {
  constructor() {
    super("Razorpay is temporarily unavailable. Please try again shortly.");
    this.name = "RazorpayServiceError";
  }
}

async function providerRequest(
  path: string,
  credentials: Credentials,
  body?: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RazorpayServiceError();
  }
  if (!response.ok) throw new RazorpayServiceError();
  const raw = await response.text();
  if (raw.length > 65_536) throw new RazorpayServiceError();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RazorpayServiceError();
  }
}

export async function createRazorpayCheckoutOrder(
  account: CurrentAccount,
  planTier: PaidPlanTier,
) {
  const credentials = getRazorpayCredentials();
  if (!credentials) throw new CheckoutUnavailableError();
  const plan = getPlanDisplay(planTier);
  const { planId, receipt } = await preparePaidPlanPurchase({
    workspaceId: account.workspace.id,
    userId: account.id,
    planTier,
  });
  const response = orderSchema.parse(
    await providerRequest("orders", credentials, {
      amount: plan.monthlyPriceCents,
      currency: "INR",
      receipt,
      partial_payment: false,
      notes: { plan: planTier },
    }),
  );
  if (
    response.amount !== plan.monthlyPriceCents ||
    response.receipt !== receipt
  ) {
    throw new PaymentVerificationError(
      "Razorpay returned an unexpected order.",
    );
  }
  await saveRazorpayOrder({
    workspaceId: account.workspace.id,
    userId: account.id,
    planId,
    planTier,
    amountPaise: plan.monthlyPriceCents,
    receipt,
    providerOrderId: response.id,
  });
  return {
    keyId: credentials.keyId,
    orderId: response.id,
    amountPaise: response.amount,
    currency: response.currency,
    planName: plan.name,
  };
}

async function confirmCapturedProviderPayment(input: {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  credentials: Credentials;
}): Promise<{ periodEnd: Date } | null> {
  const payment = paymentSchema.parse(
    await providerRequest(
      `payments/${encodeURIComponent(input.paymentId)}`,
      input.credentials,
    ),
  );
  if (payment.status === "authorized" || payment.status === "created") {
    return null;
  }
  if (
    !capturedPaymentMatchesOrder(payment, {
      paymentId: input.paymentId,
      orderId: input.orderId,
      amountPaise: input.amountPaise,
    })
  ) {
    throw new PaymentVerificationError(
      "Payment details do not match the order.",
    );
  }
  return activateCapturedPayment({
    providerOrderId: input.orderId,
    providerPaymentId: input.paymentId,
    amountPaise: payment.amount,
    currency: payment.currency,
  });
}

export async function confirmCheckoutPayment(input: {
  account: CurrentAccount;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ periodEnd: Date } | null> {
  const credentials = getRazorpayCredentials();
  if (!credentials) throw new CheckoutUnavailableError();
  const order = await getWorkspacePaymentOrder(
    input.account.workspace.id,
    input.orderId,
  );
  if (!order)
    throw new PaymentVerificationError("Payment order was not found.");
  if (
    !verifyCheckoutSignature({
      orderId: order.providerOrderId,
      paymentId: input.paymentId,
      signature: input.signature,
      keySecret: credentials.keySecret,
    })
  ) {
    throw new PaymentVerificationError("Payment signature is invalid.");
  }
  if (order.status === "CAPTURED") {
    if (order.providerPaymentId !== input.paymentId || !order.periodEnd)
      throw new PaymentVerificationError(
        "Payment details do not match the order.",
      );
    return { periodEnd: order.periodEnd };
  }
  return confirmCapturedProviderPayment({
    orderId: order.providerOrderId,
    paymentId: input.paymentId,
    amountPaise: order.amountPaise,
    credentials,
  });
}

export async function confirmWebhookPayment(input: {
  orderId: string;
  paymentId: string;
}): Promise<void> {
  const credentials = getRazorpayCredentials();
  if (!credentials) throw new CheckoutUnavailableError();
  // The signed event identifies a candidate. Re-fetch captured state and price
  // from Razorpay and our own immutable order before granting any entitlement.
  const { PaymentOrderModel, connectToDatabase } =
    await import("@website-audit/database");
  await connectToDatabase();
  const order = await PaymentOrderModel.findOne({
    providerOrderId: input.orderId,
  })
    .select({ amountPaise: 1 })
    .lean();
  if (!order) return;
  const confirmed = await confirmCapturedProviderPayment({
    orderId: input.orderId,
    paymentId: input.paymentId,
    amountPaise: order.amountPaise,
    credentials,
  });
  if (!confirmed)
    throw new PaymentVerificationError("Payment capture is pending.");
}
