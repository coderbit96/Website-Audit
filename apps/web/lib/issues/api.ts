import "server-only";

import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError } from "@website-audit/shared";

import { getCurrentAccount, type CurrentAccount } from "../auth/current-user";
import { canManageWorkspace } from "../auth/permissions";
import { applicationErrorResponse } from "../errors/api";

export type IssueApiAuthorization =
  { account: CurrentAccount } | { response: NextResponse };

export async function authorizeIssueApi(): Promise<IssueApiAuthorization> {
  const account = await getCurrentAccount();
  if (!account) {
    return {
      response: applicationErrorResponse(new AuthenticationError()),
    };
  }
  if (!canManageWorkspace(account)) {
    return {
      response: applicationErrorResponse(
        new AuthorizationError(
          "You do not have permission to update issue workflows.",
        ),
      ),
    };
  }
  return { account };
}

export function issueApiFailure(error: unknown): NextResponse {
  return applicationErrorResponse(error, {
    operation: "Issue workflow update",
  });
}
