import {
  PublicAuditRateLimitError,
  PublicLeadAuditUnavailableError,
} from "@website-audit/database";
import { NextResponse } from "next/server";

import { capturePublicLead } from "../../../lib/leads/service";
import { publicLeadRequestSchema } from "../../../lib/leads/validation";
import { isAllowedPublicAuditOrigin } from "../../../lib/public-audits/security";
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
    logSecurityRejection(request, "public_lead_untrusted_origin");
    return NextResponse.json(
      { error: "Cross-site lead requests are not allowed." },
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

  const parsed = publicLeadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check your contact information and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    await capturePublicLead(request, parsed.data);
    webLogger("info", "public_lead.accepted", {
      ...requestLogContext(request),
      requestedService: parsed.data.requestedService,
      source: parsed.data.source,
    });
    return NextResponse.json(
      { data: { received: true } },
      { status: 202, headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof PublicLeadAuditUnavailableError) {
      return NextResponse.json(
        { error: error.message },
        { status: 410, headers: responseHeaders },
      );
    }
    if (error instanceof PublicAuditRateLimitError) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            ...responseHeaders,
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }
    webLogger("error", "public_lead.capture_failed", {
      ...requestLogContext(request),
      error,
    });
    return NextResponse.json(
      { error: "Your request could not be sent. Please try again." },
      { status: 500, headers: responseHeaders },
    );
  }
}
