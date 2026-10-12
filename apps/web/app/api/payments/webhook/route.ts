import { NextResponse } from "next/server";
import { z } from "zod";

import {
  confirmWebhookPayment,
  getRazorpayCredentials,
} from "../../../../lib/payments/razorpay";
import { verifyWebhookSignature } from "../../../../lib/payments/signatures";
import { webLogger } from "../../../../lib/logging/logger";

const capturedEvent = z.object({
  event: z.literal("payment.captured"),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
        order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
      }),
    }),
  }),
});

async function boundedRawBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request): Promise<NextResponse> {
  const credentials = getRazorpayCredentials();
  if (!credentials)
    return NextResponse.json(
      { error: "Webhook unavailable." },
      { status: 503 },
    );
  const rawBody = await boundedRawBody(request);
  if (!rawBody)
    return NextResponse.json(
      { error: "Webhook body is invalid." },
      { status: 400 },
    );
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (
    !verifyWebhookSignature({
      rawBody,
      signature,
      webhookSecret: credentials.webhookSecret,
    })
  ) {
    return NextResponse.json(
      { error: "Webhook signature is invalid." },
      { status: 401 },
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Webhook body is invalid." },
      { status: 400 },
    );
  }
  if ((payload as { event?: unknown }).event !== "payment.captured") {
    return NextResponse.json({ received: true });
  }
  const parsed = capturedEvent.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Webhook event is invalid." },
      { status: 400 },
    );
  const payment = parsed.data.payload.payment.entity;
  try {
    await confirmWebhookPayment({
      orderId: payment.order_id,
      paymentId: payment.id,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    webLogger("error", "payment.webhook_failed", {
      providerOrderId: payment.order_id,
      error,
    });
    // Non-2xx tells Razorpay to retry a transient failure.
    return NextResponse.json(
      { error: "Payment processing is pending." },
      { status: 503 },
    );
  }
}
