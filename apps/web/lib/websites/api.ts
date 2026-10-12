import "server-only";

import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError } from "@website-audit/shared";

import { getCurrentAccount, type CurrentAccount } from "../auth/current-user";
import { canManageWebsites } from "./service";
import { applicationErrorResponse } from "../errors/api";

export type WebsiteApiAuthorization =
  { account: CurrentAccount } | { response: NextResponse };

export async function authorizeWebsiteApi(
  requiresWriteAccess: boolean,
): Promise<WebsiteApiAuthorization> {
  const account = await getCurrentAccount();

  if (!account) {
    return {
      response: applicationErrorResponse(new AuthenticationError()),
    };
  }

  if (requiresWriteAccess && !canManageWebsites(account)) {
    return {
      response: applicationErrorResponse(
        new AuthorizationError(
          "You do not have permission to manage websites.",
        ),
      ),
    };
  }

  return { account };
}

export function invalidJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: "Request body must be valid JSON." },
    { status: 400 },
  );
}

export function unsupportedContentTypeResponse(
  request: Request,
): NextResponse | null {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  return null;
}

export function unexpectedWebsiteApiError(
  operation: string,
  error: unknown,
): NextResponse {
  return applicationErrorResponse(error, { operation });
}
