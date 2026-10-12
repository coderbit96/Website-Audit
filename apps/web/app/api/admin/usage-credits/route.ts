import { NextResponse } from "next/server";
import { UsageCreditConflictError } from "@website-audit/database";

import { authorizeSuperAdminApi } from "../../../../lib/admin/api";
import { grantSuperAdminOfflineCredit } from "../../../../lib/admin/service";
import { grantOfflineCreditSchema } from "../../../../lib/admin/validation";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";
import { requestLogContext, webLogger } from "../../../../lib/logging/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeSuperAdminApi();
  if ("response" in authorization) return authorization.response;
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }
  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;
  const parsed = grantOfflineCreditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The usage credit request is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await grantSuperAdminOfflineCredit(
      authorization.account,
      parsed.data,
    );
    webLogger("info", "admin.usage_credit_granted", {
      ...requestLogContext(request),
      adminUserId: authorization.account.id,
      workspaceId: parsed.data.workspaceId,
      metric: parsed.data.metric,
      quantity: parsed.data.quantity,
      replayed: result.replayed,
    });
    return NextResponse.json({
      data: {
        periodStart: result.periodStart.toISOString(),
        periodEnd: result.periodEnd.toISOString(),
        replayed: result.replayed,
      },
    });
  } catch (error) {
    if (error instanceof UsageCreditConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    webLogger("error", "admin.usage_credit_failed", {
      ...requestLogContext(request),
      adminUserId: authorization.account.id,
      workspaceId: parsed.data.workspaceId,
      error,
    });
    return NextResponse.json(
      { error: "The usage credit could not be granted." },
      { status: 500 },
    );
  }
}
