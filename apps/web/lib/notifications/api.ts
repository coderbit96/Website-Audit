import "server-only";

import { NextResponse } from "next/server";
import { AuthenticationError } from "@website-audit/shared";

import { getCurrentAccount, type CurrentAccount } from "../auth/current-user";
import { applicationErrorResponse } from "../errors/api";

export type NotificationApiAuthorization =
  { account: CurrentAccount } | { response: NextResponse };

export async function authorizeNotificationApi(): Promise<NotificationApiAuthorization> {
  const account = await getCurrentAccount();
  if (!account) {
    return {
      response: applicationErrorResponse(new AuthenticationError()),
    };
  }
  return { account };
}

export function invalidNotificationJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: "Request body must be valid JSON." },
    { status: 400 },
  );
}

export function unsupportedNotificationContentTypeResponse(
  request: Request,
): NextResponse | null {
  return request.headers.get("content-type")?.includes("application/json")
    ? null
    : NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
}

export function unexpectedNotificationApiError(
  operation: string,
  error: unknown,
): NextResponse {
  return applicationErrorResponse(error, { operation });
}
