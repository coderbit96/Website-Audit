import "server-only";

import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError } from "@website-audit/shared";

import { getCurrentAccount, type CurrentAccount } from "../auth/current-user";
import { canManageWorkspace } from "../auth/permissions";
import { applicationErrorResponse } from "../errors/api";

export type AuditApiAuthorization =
  { account: CurrentAccount } | { response: NextResponse };

export async function authorizeAuditApi(
  requiresWriteAccess: boolean,
): Promise<AuditApiAuthorization> {
  const account = await getCurrentAccount();
  if (!account) {
    return {
      response: applicationErrorResponse(new AuthenticationError()),
    };
  }

  if (requiresWriteAccess && !canManageWorkspace(account)) {
    return {
      response: applicationErrorResponse(
        new AuthorizationError("You do not have permission to manage audits."),
      ),
    };
  }

  return { account };
}

export function auditApiFailure(
  operation: string,
  error: unknown,
): NextResponse {
  return applicationErrorResponse(error, { operation });
}
