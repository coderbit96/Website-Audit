import { RateLimitError } from "@website-audit/database";
import { NextResponse } from "next/server";

import {
  auditApiFailure,
  authorizeAuditApi,
} from "../../../../../../lib/audits/api";
import { generateWorkspaceAuditPdf } from "../../../../../../lib/reports/pdf-report";
import { planEntitlementResponse } from "../../../../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../../../../lib/entitlements/service";
import { rateLimitResponse } from "../../../../../../lib/rate-limit/response";
import {
  authenticatedRateLimitSubjects,
  enforceRateLimit,
} from "../../../../../../lib/rate-limit/service";
import { mutationOriginResponse } from "../../../../../../lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 60;

type PdfReportRouteContext = { params: Promise<{ auditId: string }> };

export async function POST(
  request: Request,
  context: PdfReportRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeAuditApi(false);
  if ("response" in authorization) return authorization.response;

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  try {
    await enforceRateLimit(
      "REPORT_GENERATION",
      authenticatedRateLimitSubjects(request, authorization.account),
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }

  try {
    const { auditId } = await context.params;
    const result = await generateWorkspaceAuditPdf(
      authorization.account,
      auditId,
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    }
    if (result.outcome === "not_completed") {
      return NextResponse.json(
        { error: "The audit must be completed before generating a PDF." },
        { status: 409 },
      );
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(result.buffer.byteLength),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
        "X-Report-Id": result.reportId,
      },
    });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    return auditApiFailure("PDF report generation", error);
  }
}
