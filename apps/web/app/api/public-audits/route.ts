import {
  PublicAuditCapacityError,
  PublicAuditRateLimitError,
} from "@website-audit/database";
import { NextResponse } from "next/server";
import { getCurrentAccount } from "../../../lib/auth/current-user";
import { PlanEntitlementError } from "../../../lib/entitlements/service";
import { planEntitlementResponse } from "../../../lib/entitlements/api";

import {
  createFreePublicAudit,
  PublicAuditInputError,
} from "../../../lib/public-audits/service";
import { isAllowedPublicAuditOrigin } from "../../../lib/public-audits/security";
import { publicAuditRequestSchema } from "../../../lib/public-audits/validation";
import { readBoundedJsonBody } from "../../../lib/security/request";
import {
  logSecurityRejection,
  requestLogContext,
  webLogger,
} from "../../../lib/logging/logger";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAllowedPublicAuditOrigin(request)) {
    logSecurityRejection(request, "public_audit_untrusted_origin");
    return NextResponse.json(
      { error: "Cross-site audit requests are not allowed." },
      { status: 403, headers: responseHeaders },
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415, headers: responseHeaders },
    );
  }

  const json = await readBoundedJsonBody(request, 4_096, responseHeaders);
  if ("response" in json) return json.response;
  const body = json.body;

  const parsed = publicAuditRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      {
        error: "Enter a valid public website URL.",
        ...(fieldErrors.url ? { fieldErrors: { url: fieldErrors.url } } : {}),
      },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const account = await getCurrentAccount();
    const result = await createFreePublicAudit(request, parsed.data, account);
    const resultUrl = `/audit/${result.token}`;
    webLogger("info", "public_audit.queued", {
      ...requestLogContext(request),
      auditId: result.auditId,
      expiresAt: result.expiresAt,
    });
    return NextResponse.json(
      {
        data: {
          token: result.token,
          expiresAt: result.expiresAt,
          resultUrl,
        },
      },
      {
        status: 202,
        headers: { ...responseHeaders, Location: resultUrl },
      },
    );
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return planEntitlementResponse(error);
    }
    if (error instanceof PublicAuditInputError) {
      logSecurityRejection(request, "public_audit_url_rejected");
      return NextResponse.json(
        { error: error.message, fieldErrors: { url: [error.message] } },
        { status: 400, headers: responseHeaders },
      );
    }
    if (
      error instanceof PublicAuditRateLimitError ||
      error instanceof PublicAuditCapacityError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            ...responseHeaders,
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }
    webLogger("error", "public_audit.creation_failed", {
      ...requestLogContext(request),
      error,
    });
    return NextResponse.json(
      { error: "The free audit could not be started. Please try again." },
      { status: 500, headers: responseHeaders },
    );
  }
}
