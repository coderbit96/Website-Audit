import "server-only";

import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError } from "@website-audit/shared";

import { getCurrentAccount, type CurrentAccount } from "../auth/current-user";
import { canManageClients } from "./service";
import { applicationErrorResponse } from "../errors/api";

export type ClientApiAuthorization =
  { account: CurrentAccount } | { response: NextResponse };

export async function authorizeClientApi(
  requiresWriteAccess: boolean,
): Promise<ClientApiAuthorization> {
  const account = await getCurrentAccount();
  if (!account) {
    return {
      response: applicationErrorResponse(new AuthenticationError()),
    };
  }
  if (requiresWriteAccess && !canManageClients(account)) {
    return {
      response: applicationErrorResponse(
        new AuthorizationError("You do not have permission to manage clients."),
      ),
    };
  }
  return { account };
}

export function invalidClientJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: "Request body must be valid JSON." },
    { status: 400 },
  );
}

export function unsupportedClientContentTypeResponse(
  request: Request,
): NextResponse | null {
  return request.headers.get("content-type")?.includes("application/json")
    ? null
    : NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
}

export function unexpectedClientApiError(
  operation: string,
  error: unknown,
): NextResponse {
  return applicationErrorResponse(error, { operation });
}
