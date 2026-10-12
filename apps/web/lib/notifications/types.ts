import type { NotificationType } from "@website-audit/database";

export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPageView = {
  notifications: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
};

export type NotificationMutationResult = {
  notification?: NotificationView;
  updatedCount?: number;
  unreadCount: number;
};

export type NotificationApiError = { error: string };
