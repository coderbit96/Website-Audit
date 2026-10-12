import { NextResponse } from "next/server";

import {
  authorizeNotificationApi,
  unexpectedNotificationApiError,
  unsupportedNotificationContentTypeResponse,
} from "../../../../lib/notifications/api";
import { markAccountNotificationRead } from "../../../../lib/notifications/service";
import { markNotificationReadSchema } from "../../../../lib/notifications/validation";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";

type NotificationRouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(
  request: Request,
  context: NotificationRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeNotificationApi();
  if ("response" in authorization) return authorization.response;
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;
  const contentTypeError = unsupportedNotificationContentTypeResponse(request);
  if (contentTypeError) return contentTypeError;
  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;
  if (!markNotificationReadSchema.safeParse(body).success) {
    return NextResponse.json(
      { error: "The notification action is invalid." },
      { status: 400 },
    );
  }
  try {
    const { notificationId } = await context.params;
    const result = await markAccountNotificationRead(
      authorization.account,
      notificationId,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Notification not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    return unexpectedNotificationApiError("Marking a notification read", error);
  }
}
