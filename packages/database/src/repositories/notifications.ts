import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditStatus,
  FindingSeverity,
  NotificationType,
  ReportGenerationStatus,
  type NotificationType as NotificationTypeValue,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditModel,
  NotificationModel,
  ReportModel,
  ScheduledAuditModel,
  WebsiteModel,
} from "../models.js";

export const NOTIFICATIONS_PAGE_SIZE = 20;
export const SCORE_DROP_NOTIFICATION_THRESHOLD = 5;

export type NotificationRecord = {
  id: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationPageRecord = {
  notifications: NotificationRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
};

type NotificationScope = {
  userId: Types.ObjectId;
  $or: Array<
    | { workspaceId: Types.ObjectId }
    | { workspaceId: { $exists: false } }
    | { workspaceId: null }
  >;
};

function accountNotificationScope(input: {
  userId: string;
  workspaceId: string;
}): NotificationScope | null {
  if (
    !Types.ObjectId.isValid(input.userId) ||
    !Types.ObjectId.isValid(input.workspaceId)
  ) {
    return null;
  }
  return {
    userId: new Types.ObjectId(input.userId),
    $or: [
      { workspaceId: new Types.ObjectId(input.workspaceId) },
      { workspaceId: { $exists: false } },
      { workspaceId: null },
    ],
  };
}

function unreadFilter(): {
  $or: Array<{ readAt: { $exists: false } } | { readAt: null }>;
} {
  return { $or: [{ readAt: { $exists: false } }, { readAt: null }] };
}

export function sanitizeNotificationHref(
  value: string | undefined,
): string | undefined {
  const href = value?.trim();
  if (
    !href ||
    href.length > 500 ||
    (href !== "/dashboard" &&
      !href.startsWith("/dashboard/") &&
      !href.startsWith("/dashboard?")) ||
    href.startsWith("//") ||
    href.includes("\\")
  ) {
    return undefined;
  }
  return href;
}

function serializeNotification(notification: {
  _id: Types.ObjectId;
  type: NotificationTypeValue;
  title: string;
  message: string;
  href?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    href: sanitizeNotificationHref(notification.href ?? undefined) ?? null,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

export async function listNotificationsForAccount(input: {
  userId: string;
  workspaceId: string;
  page?: number;
  pageSize?: number;
}): Promise<NotificationPageRecord> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(
    1,
    Math.min(
      NOTIFICATIONS_PAGE_SIZE,
      Math.floor(input.pageSize ?? NOTIFICATIONS_PAGE_SIZE),
    ),
  );
  const scope = accountNotificationScope(input);
  if (!scope) {
    return {
      notifications: [],
      page,
      pageSize,
      total: 0,
      totalPages: 1,
      unreadCount: 0,
    };
  }
  await connectToDatabase();
  const [total, unreadCount] = await Promise.all([
    NotificationModel.countDocuments(scope),
    NotificationModel.countDocuments({ $and: [scope, unreadFilter()] }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const notifications = await NotificationModel.find(scope)
    .select({
      type: 1,
      title: 1,
      message: 1,
      href: 1,
      readAt: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1, _id: -1 })
    .skip((resolvedPage - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  return {
    notifications: notifications.map(serializeNotification),
    page: resolvedPage,
    pageSize,
    total,
    totalPages,
    unreadCount,
  };
}

export async function getNotificationUnreadCount(input: {
  userId: string;
  workspaceId: string;
}): Promise<number> {
  const scope = accountNotificationScope(input);
  if (!scope) return 0;
  await connectToDatabase();
  return NotificationModel.countDocuments({ $and: [scope, unreadFilter()] });
}

export async function markNotificationReadForAccount(input: {
  userId: string;
  workspaceId: string;
  notificationId: string;
}): Promise<{ notification: NotificationRecord; unreadCount: number } | null> {
  if (!Types.ObjectId.isValid(input.notificationId)) return null;
  const scope = accountNotificationScope(input);
  if (!scope) return null;
  await connectToDatabase();
  const notification = await NotificationModel.findOneAndUpdate(
    { $and: [scope, { _id: new Types.ObjectId(input.notificationId) }] },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  )
    .select({ type: 1, title: 1, message: 1, href: 1, readAt: 1, createdAt: 1 })
    .lean()
    .exec();
  if (!notification) return null;
  const unreadCount = await NotificationModel.countDocuments({
    $and: [scope, unreadFilter()],
  });
  return { notification: serializeNotification(notification), unreadCount };
}

export async function markAllNotificationsReadForAccount(input: {
  userId: string;
  workspaceId: string;
}): Promise<{ updatedCount: number; unreadCount: 0 }> {
  const scope = accountNotificationScope(input);
  if (!scope) return { updatedCount: 0, unreadCount: 0 };
  await connectToDatabase();
  const result = await NotificationModel.updateMany(
    { $and: [scope, unreadFilter()] },
    { $set: { readAt: new Date() } },
  ).exec();
  return { updatedCount: result.modifiedCount, unreadCount: 0 };
}

export async function createNotification(input: {
  userId: string;
  workspaceId?: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
  href?: string;
  dedupeKey: string;
  data?: Readonly<Record<string, unknown>>;
}): Promise<string | null> {
  if (
    !Types.ObjectId.isValid(input.userId) ||
    (input.workspaceId && !Types.ObjectId.isValid(input.workspaceId))
  ) {
    return null;
  }
  const title = input.title.trim().slice(0, 160);
  const message = input.message.trim().slice(0, 500);
  const dedupeKey = input.dedupeKey.trim().slice(0, 240);
  if (!title || !message || !dedupeKey) return null;
  await connectToDatabase();
  const notification = await NotificationModel.findOneAndUpdate(
    { userId: input.userId, dedupeKey },
    {
      $setOnInsert: {
        userId: input.userId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        type: input.type,
        title,
        message,
        ...(sanitizeNotificationHref(input.href)
          ? { href: input.href?.trim() }
          : {}),
        ...(input.data ? { data: input.data } : {}),
      },
    },
    { upsert: true, returnDocument: "after" },
  )
    .select({ _id: 1 })
    .lean()
    .exec();
  return notification?._id.toString() ?? null;
}

export async function createAuditCompletionNotifications(
  auditId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(auditId)) return;
  await connectToDatabase();
  const audit = await AuditModel.findOne({
    _id: auditId,
    status: AuditStatus.COMPLETED,
  })
    .select({
      workspaceId: 1,
      websiteId: 1,
      requestedById: 1,
      scheduledAuditId: 1,
      overallScore: 1,
      createdAt: 1,
    })
    .lean()
    .exec();
  if (!audit) return;
  const [website, schedule] = await Promise.all([
    WebsiteModel.findOne({
      _id: audit.websiteId,
      workspaceId: audit.workspaceId,
    })
      .select({ name: 1, url: 1 })
      .lean()
      .exec(),
    audit.scheduledAuditId
      ? ScheduledAuditModel.findOne({
          _id: audit.scheduledAuditId,
          workspaceId: audit.workspaceId,
        })
          .select({ createdById: 1 })
          .lean()
          .exec()
      : null,
  ]);
  const userId = audit.requestedById ?? schedule?.createdById;
  if (!userId || !website) return;
  const websiteName = website.name?.trim() || website.url;
  const href = `/dashboard/audits/${audit._id.toString()}`;
  const primaryType = audit.scheduledAuditId
    ? NotificationType.SCHEDULED_AUDIT_COMPLETED
    : NotificationType.AUDIT_COMPLETED;
  const writes: Promise<string | null>[] = [
    createNotification({
      userId: userId.toString(),
      workspaceId: audit.workspaceId.toString(),
      type: primaryType,
      title: audit.scheduledAuditId
        ? "Scheduled audit completed"
        : "Audit completed",
      message: `${websiteName} finished auditing${typeof audit.overallScore === "number" ? ` with an Overall score of ${Math.round(audit.overallScore)}` : ""}.`,
      href,
      dedupeKey: `audit:${audit._id.toString()}:completed`,
      data: {
        auditId: audit._id.toString(),
        websiteId: audit.websiteId.toString(),
      },
    }),
  ];

  const criticalCount = await AuditFindingModel.countDocuments({
    auditId: audit._id,
    severity: FindingSeverity.CRITICAL,
  });
  if (criticalCount > 0) {
    writes.push(
      createNotification({
        userId: userId.toString(),
        workspaceId: audit.workspaceId.toString(),
        type: NotificationType.CRITICAL_ISSUE_FOUND,
        title: "Critical issues need attention",
        message: `${websiteName} has ${criticalCount} critical ${criticalCount === 1 ? "issue" : "issues"} in its latest audit.`,
        href: `${href}?tab=issues`,
        dedupeKey: `audit:${audit._id.toString()}:critical-issues`,
        data: { auditId: audit._id.toString(), criticalCount },
      }),
    );
  }

  if (typeof audit.overallScore === "number") {
    const previous = await AuditModel.findOne({
      _id: { $ne: audit._id },
      workspaceId: audit.workspaceId,
      websiteId: audit.websiteId,
      status: AuditStatus.COMPLETED,
      overallScore: { $type: "number" },
      // Fast completion paths can share a timestamp. ObjectIds preserve the
      // insertion order in that rare tie, so the previous audit remains
      // eligible for a score-change notification.
      $or: [
        { createdAt: { $lt: audit.createdAt } },
        { createdAt: audit.createdAt, _id: { $lt: audit._id } },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .select({ overallScore: 1 })
      .lean()
      .exec();
    if (
      typeof previous?.overallScore === "number" &&
      previous.overallScore - audit.overallScore >=
        SCORE_DROP_NOTIFICATION_THRESHOLD
    ) {
      const decrease = Math.round(previous.overallScore - audit.overallScore);
      writes.push(
        createNotification({
          userId: userId.toString(),
          workspaceId: audit.workspaceId.toString(),
          type: NotificationType.SCORE_DROPPED,
          title: "Website score dropped",
          message: `${websiteName}'s Overall score fell from ${Math.round(previous.overallScore)} to ${Math.round(audit.overallScore)} (${decrease} points).`,
          href,
          dedupeKey: `audit:${audit._id.toString()}:score-dropped`,
          data: {
            auditId: audit._id.toString(),
            previousScore: previous.overallScore,
            currentScore: audit.overallScore,
          },
        }),
      );
    }
  }
  await Promise.all(writes);
}

export async function createAuditFailureNotification(
  auditId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(auditId)) return;
  await connectToDatabase();
  const audit = await AuditModel.findOne({
    _id: auditId,
    status: AuditStatus.FAILED,
  })
    .select({ workspaceId: 1, websiteId: 1, requestedById: 1 })
    .lean()
    .exec();
  if (!audit?.requestedById) return;
  const website = await WebsiteModel.findOne({
    _id: audit.websiteId,
    workspaceId: audit.workspaceId,
  })
    .select({ name: 1, url: 1 })
    .lean()
    .exec();
  if (!website) return;
  await createNotification({
    userId: audit.requestedById.toString(),
    workspaceId: audit.workspaceId.toString(),
    type: NotificationType.AUDIT_FAILED,
    title: "Audit could not be completed",
    message: `${website.name?.trim() || website.url} stopped before the audit finished. Open the audit for safe diagnostic details.`,
    href: `/dashboard/audits/${audit._id.toString()}`,
    dedupeKey: `audit:${audit._id.toString()}:failed`,
    data: {
      auditId: audit._id.toString(),
      websiteId: audit.websiteId.toString(),
    },
  });
}

export async function createReportReadyNotification(
  reportId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(reportId)) return;
  await connectToDatabase();
  const report = await ReportModel.findOne({
    _id: reportId,
    status: ReportGenerationStatus.COMPLETED,
  })
    .select({ workspaceId: 1, auditId: 1, createdById: 1, title: 1 })
    .lean()
    .exec();
  if (!report?.createdById) return;
  await createNotification({
    userId: report.createdById.toString(),
    workspaceId: report.workspaceId.toString(),
    type: NotificationType.REPORT_READY,
    title: "PDF report is ready",
    message: `${report.title} was generated successfully and is ready from the audit report.`,
    href: `/dashboard/audits/${report.auditId.toString()}`,
    dedupeKey: `report:${report._id.toString()}:ready`,
    data: {
      reportId: report._id.toString(),
      auditId: report.auditId.toString(),
    },
  });
}
