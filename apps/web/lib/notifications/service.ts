import "server-only";

import {
  getNotificationUnreadCount,
  listNotificationsForAccount,
  markAllNotificationsReadForAccount,
  markNotificationReadForAccount,
  type NotificationPageRecord,
  type NotificationRecord,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import type {
  NotificationMutationResult,
  NotificationPageView,
  NotificationView,
} from "./types";

function serializeNotification(record: NotificationRecord): NotificationView {
  return {
    ...record,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeNotificationPage(
  record: NotificationPageRecord,
): NotificationPageView {
  return {
    ...record,
    notifications: record.notifications.map(serializeNotification),
  };
}

export async function listAccountNotifications(
  account: CurrentAccount,
  page = 1,
): Promise<NotificationPageView> {
  const result = await listNotificationsForAccount({
    userId: account.id,
    workspaceId: account.workspace.id,
    page,
  });
  return serializeNotificationPage(result);
}

export function getAccountUnreadNotificationCount(
  account: CurrentAccount,
): Promise<number> {
  return getNotificationUnreadCount({
    userId: account.id,
    workspaceId: account.workspace.id,
  });
}

export async function markAccountNotificationRead(
  account: CurrentAccount,
  notificationId: string,
): Promise<NotificationMutationResult | null> {
  const result = await markNotificationReadForAccount({
    userId: account.id,
    workspaceId: account.workspace.id,
    notificationId,
  });
  if (!result) return null;
  return {
    notification: serializeNotification(result.notification),
    unreadCount: result.unreadCount,
  };
}

export async function markAllAccountNotificationsRead(
  account: CurrentAccount,
): Promise<NotificationMutationResult> {
  const result = await markAllNotificationsReadForAccount({
    userId: account.id,
    workspaceId: account.workspace.id,
  });
  return result;
}
