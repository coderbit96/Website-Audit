import {
  consumePublicAuditStatusRateLimits,
  PublicAuditRateLimitError,
} from "@website-audit/database";
import { NextResponse } from "next/server";

import { getFreePublicAudit } from "../../../../lib/public-audits/service";
import { createPublicAuditClientKey } from "../../../../lib/public-audits/security";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  try {
    await consumePublicAuditStatusRateLimits({
      clientKeyHash: createPublicAuditClientKey(request),
    });
  } catch (error) {
    if (error instanceof PublicAuditRateLimitError) {
      return NextResponse.json(
        { error: "Progress is being checked too frequently. Please wait." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Referrer-Policy": "no-referrer",
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }
    throw error;
  }
  const audit = await getFreePublicAudit(token);
  if (!audit) {
    return NextResponse.json(
      { error: "This free audit is unavailable or has expired." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  return NextResponse.json(
    { data: audit },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
