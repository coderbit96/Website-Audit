import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAccount } from "../../../../lib/auth/current-user";
import {
  CheckoutUnavailableError,
  confirmCheckoutPayment,
  PaymentVerificationError,
  RazorpayServiceError,
} from "../../../../lib/payments/razorpay";
import { applicationErrorResponse } from "../../../../lib/errors/api";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";
import {
  authenticatedRateLimitSubjects,
  enforceRateLimit,
} from "../../../../lib/rate-limit/service";

const confirmationRequest = z
  .object({
    orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
    paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
    signature: z.string().regex(/^[a-f\d]{64}$/i),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const account = await getCurrentAccount();
  if (!account)
    return NextResponse.json(
      { error: "Sign in to confirm payment." },
      { status: 401 },
    );
  const originError = mutationOriginResponse(request);
  if (originError) return originError;
  const body = await readBoundedJsonBody(request, 2_048);
  if ("response" in body) return body.response;
  const parsed = confirmationRequest.safeParse(body.body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Payment details are invalid." },
      { status: 400 },
    );
  try {
    await enforceRateLimit(
      "PAYMENT_CONFIRMATION",
      authenticatedRateLimitSubjects(request, account),
    );
    const confirmed = await confirmCheckoutPayment({ account, ...parsed.data });
    if (!confirmed)
      return NextResponse.json(
        {
          error:
            "Payment is still processing. Your plan will update after capture.",
        },
        { status: 202 },
      );
    return NextResponse.json({
      data: { periodEnd: confirmed.periodEnd.toISOString() },
    });
  } catch (error) {
    if (error instanceof CheckoutUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof RazorpayServiceError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof PaymentVerificationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return applicationErrorResponse(error, {
      operation: "Confirming Razorpay payment",
    });
  }
}
