import { NextResponse } from "next/server";

import {
  DuplicateEmailError,
  RegistrationError,
} from "../../../../lib/auth/registration-core";
import { registerUser } from "../../../../lib/auth/registration";
import { registerSchema } from "../../../../lib/auth/validation";
import { RateLimitError } from "@website-audit/database";
import {
  anonymousRateLimitSubjects,
  enforceRateLimit,
} from "../../../../lib/rate-limit/service";
import { rateLimitResponse } from "../../../../lib/rate-limit/response";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";
import { requestLogContext, webLogger } from "../../../../lib/logging/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;

  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    await enforceRateLimit(
      "REGISTRATION",
      anonymousRateLimitSubjects(request, parsed.data.email),
    );
    const account = await registerUser(parsed.data);

    webLogger("info", "auth.registration_completed", {
      ...requestLogContext(request),
      userId: account.userId,
      workspaceId: account.workspaceId,
    });

    return NextResponse.json(
      { data: { userId: account.userId, workspaceId: account.workspaceId } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof DuplicateEmailError) {
      // Do not let this endpoint be used to enumerate registered emails.
      return NextResponse.json(
        { error: "Unable to create an account with those details." },
        { status: 400 },
      );
    }

    webLogger("error", "auth.registration_failed", {
      ...requestLogContext(request),
      error,
    });
    const message =
      error instanceof RegistrationError
        ? error.message
        : "Unable to create your account right now. Please try again.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
