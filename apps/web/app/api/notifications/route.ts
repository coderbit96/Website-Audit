import { NextResponse } from "next/server";

import {
  authorizeNotificationApi,
  unexpectedNotificationApiError,
  unsupportedNotificationContentTypeResponse,
} from "../../../lib/notifications/api";
import {
  listAccountNotifications,
  markAllAccountNotificationsRead,
} from "../../../lib/notifications/service";
import {
  markAllNotificationsReadSchema,
  parseNotificationPage,
} from "../../../lib/notifications/validation";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../lib/security/request";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeNotificationApi();
  if ("response" in authorization) return authorization.response;
  const page = parseNotificationPage(
    new URL(request.url).searchParams.get("page") ?? undefined,
  );
  try {
    const notifications = await listAccountNotifications(
      authorization.account,
      page,
    );
    return NextResponse.json({ data: notifications });
  } catch (error) {
    return unexpectedNotificationApiError("Listing notifications", error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const authorization = await authorizeNotificationApi();
  if ("response" in authorization) return authorization.response;
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;
  const contentTypeError = unsupportedNotificationContentTypeResponse(request);
  if (contentTypeError) return contentTypeError;
  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;
  if (!markAllNotificationsReadSchema.safeParse(body).success) {
    return NextResponse.json(
      { error: "The notification action is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await markAllAccountNotificationsRead(authorization.account);
    return NextResponse.json({ data: result });
  } catch (error) {
    return unexpectedNotificationApiError(
      "Marking all notifications read",
      error,
    );
  }
}
