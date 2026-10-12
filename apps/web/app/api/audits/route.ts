import {
  RateLimitError,
  WebsiteNotAvailableForAuditError,
} from "@website-audit/database";
import { NextResponse } from "next/server";

import { auditApiFailure, authorizeAuditApi } from "../../../lib/audits/api";
import { enqueueWorkspaceAudit } from "../../../lib/audits/service";
import { createAuditSchema } from "../../../lib/audits/validation";
import { planEntitlementResponse } from "../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../lib/entitlements/service";
import { rateLimitResponse } from "../../../lib/rate-limit/response";
import {
  authenticatedRateLimitSubjects,
  enforceRateLimit,
} from "../../../lib/rate-limit/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../lib/security/request";
import { requestLogContext, webLogger } from "../../../lib/logging/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAuditApi(true);
  if ("response" in authorization) return authorization.response;

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  try {
    await enforceRateLimit(
      "AUDIT_CREATION",
      authenticatedRateLimitSubjects(request, authorization.account),
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;

  const parsed = createAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the audit configuration.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const audit = await enqueueWorkspaceAudit(
      authorization.account,
      parsed.data,
    );
    webLogger("info", "audit.queued", {
      ...requestLogContext(request),
      auditId: audit.auditId,
      workspaceId: authorization.account.workspace.id,
      userId: authorization.account.id,
      websiteId: parsed.data.websiteId,
      preset: parsed.data.preset,
    });
    return NextResponse.json({ data: audit }, { status: 202 });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    if (error instanceof WebsiteNotAvailableForAuditError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return auditApiFailure("Enqueue", error);
  }
}
