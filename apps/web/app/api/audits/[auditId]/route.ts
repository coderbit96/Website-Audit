import { NextResponse } from "next/server";

import { auditApiFailure, authorizeAuditApi } from "../../../../lib/audits/api";
import {
  cancelWorkspaceAudit,
  getWorkspaceAuditStatus,
} from "../../../../lib/audits/service";
import { mutationOriginResponse } from "../../../../lib/security/request";
import { requestLogContext, webLogger } from "../../../../lib/logging/logger";

type AuditRouteContext = { params: Promise<{ auditId: string }> };

export async function GET(
  _request: Request,
  context: AuditRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeAuditApi(false);
  if ("response" in authorization) return authorization.response;

  try {
    const { auditId } = await context.params;
    const audit = await getWorkspaceAuditStatus(authorization.account, auditId);
    if (!audit) {
      return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    }

    return NextResponse.json(
      { data: audit },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return auditApiFailure("Status lookup", error);
  }
}

export async function DELETE(
  request: Request,
  context: AuditRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeAuditApi(true);
  if ("response" in authorization) return authorization.response;

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  try {
    const { auditId } = await context.params;
    const result = await cancelWorkspaceAudit(authorization.account, auditId);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    }

    webLogger("info", "audit.cancellation_processed", {
      ...requestLogContext(request),
      auditId,
      workspaceId: authorization.account.workspace.id,
      userId: authorization.account.id,
      outcome: result.outcome,
      status: result.status,
    });

    return NextResponse.json({
      data: {
        status: result.status,
        cancelled: result.outcome === "cancelled",
      },
    });
  } catch (error) {
    return auditApiFailure("Cancellation", error);
  }
}
