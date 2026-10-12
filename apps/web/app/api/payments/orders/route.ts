import { NextResponse } from "next/server";
import {
  isPaidPlanTier,
  PaidPlanUnavailableError,
  PaymentAccessError,
} from "@website-audit/database";
import { z } from "zod";

import { getCurrentAccount } from "../../../../lib/auth/current-user";
import {
  CheckoutUnavailableError,
  createRazorpayCheckoutOrder,
  RazorpayServiceError,
} from "../../../../lib/payments/razorpay";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";
import {
  authenticatedRateLimitSubjects,
  enforceRateLimit,
} from "../../../../lib/rate-limit/service";
import { applicationErrorResponse } from "../../../../lib/errors/api";

const orderRequest = z.object({ planTier: z.string() }).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const account = await getCurrentAccount();
  if (!account)
    return NextResponse.json(
      { error: "Sign in to choose a plan." },
      { status: 401 },
    );
  const originError = mutationOriginResponse(request);
  if (originError) return originError;
  const body = await readBoundedJsonBody(request, 2_048);
  if ("response" in body) return body.response;
  const parsed = orderRequest.safeParse(body.body);
  if (!parsed.success || !isPaidPlanTier(parsed.data.planTier)) {
    return NextResponse.json(
      { error: "Choose a valid paid plan." },
      { status: 400 },
    );
  }
  try {
    await enforceRateLimit(
      "PAYMENT_ORDER",
      authenticatedRateLimitSubjects(request, account),
    );
    const order = await createRazorpayCheckoutOrder(
      account,
      parsed.data.planTier,
    );
    return NextResponse.json({ data: order });
  } catch (error) {
    if (error instanceof PaymentAccessError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PaidPlanUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof CheckoutUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof RazorpayServiceError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    return applicationErrorResponse(error, {
      operation: "Creating Razorpay order",
    });
  }
}
