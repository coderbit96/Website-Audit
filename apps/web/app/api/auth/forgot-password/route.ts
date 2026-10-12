import { RateLimitError } from "@website-audit/database";
import { NextResponse } from "next/server";

import { forgotPasswordSchema } from "../../../../lib/auth/validation";
import { rateLimitResponse } from "../../../../lib/rate-limit/response";
import {
  anonymousRateLimitSubjects,
  enforceRateLimit,
} from "../../../../lib/rate-limit/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";

/**
 * Password reset delivery is intentionally not configured yet. This endpoint
 * provides a non-enumerating, rate-limited foundation for that future flow.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const json = await readBoundedJsonBody(request, 4_096);
  if ("response" in json) return json.response;
  const body = json.body;
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    await enforceRateLimit(
      "PASSWORD_RESET",
      anonymousRateLimitSubjects(request, parsed.data.email),
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }

  return NextResponse.json(
    {
      data: { accepted: true },
      message:
        "Password reset email delivery is not configured yet. Your account has not been changed.",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
