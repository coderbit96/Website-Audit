import { NextResponse } from "next/server";

import {
  auditApiFailure,
  authorizeAuditApi,
} from "../../../../../lib/audits/api";
import { getWorkspaceAuditStatus } from "../../../../../lib/audits/service";

type AuditStatusRouteContext = { params: Promise<{ auditId: string }> };

export async function GET(
  _request: Request,
  context: AuditStatusRouteContext,
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
    return auditApiFailure("Status polling", error);
  }
}
