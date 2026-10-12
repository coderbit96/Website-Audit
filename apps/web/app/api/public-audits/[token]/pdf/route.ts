import { RateLimitError } from "@website-audit/database";
import { NextResponse } from "next/server";

import { getCurrentAccount } from "../../../../../lib/auth/current-user";
import { auditApiFailure } from "../../../../../lib/audits/api";
import { planEntitlementResponse } from "../../../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../../../lib/entitlements/service";
import { rateLimitResponse } from "../../../../../lib/rate-limit/response";
import {
  authenticatedRateLimitSubjects,
  enforceRateLimit,
} from "../../../../../lib/rate-limit/service";
import { generatePublicAuditPdf } from "../../../../../lib/reports/pdf-report";
import { mutationOriginResponse } from "../../../../../lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to download this report." },
      { status: 401 },
    );
  }
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  try {
    await enforceRateLimit(
      "REPORT_GENERATION",
      authenticatedRateLimitSubjects(request, account),
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }

  try {
    const { token } = await params;
    const result = await generatePublicAuditPdf(account, token);
    if (result.outcome === "not_found") {
      return NextResponse.json(
        { error: "This audit link is invalid or has expired." },
        { status: 404 },
      );
    }
    if (result.outcome === "not_completed") {
      return NextResponse.json(
        { error: "The audit must finish before its PDF is available." },
        { status: 409 },
      );
    }
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(result.buffer.byteLength),
        "Content-Type": "application/pdf",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return planEntitlementResponse(error, account);
    }
    return auditApiFailure("Public PDF report generation", error);
  }
}
