import type { NotificationType as NotificationTypeValue } from "@website-audit/database";

export type NotificationTone =
  "success" | "danger" | "warning" | "info" | "neutral";

export type NotificationPresentation = {
  label: string;
  shortLabel: string;
  tone: NotificationTone;
};

const presentations: Partial<
  Record<NotificationTypeValue, NotificationPresentation>
> = {
  AUDIT_COMPLETED: {
    label: "Audit completed",
    shortLabel: "AC",
    tone: "success",
  },
  AUDIT_FAILED: {
    label: "Audit failed",
    shortLabel: "AF",
    tone: "danger",
  },
  SCORE_DROPPED: {
    label: "Score dropped",
    shortLabel: "SD",
    tone: "warning",
  },
  CRITICAL_ISSUE_FOUND: {
    label: "Critical issue",
    shortLabel: "CI",
    tone: "danger",
  },
  SCHEDULED_AUDIT_COMPLETED: {
    label: "Scheduled audit",
    shortLabel: "SA",
    tone: "success",
  },
  SUBSCRIPTION_LIMIT_REACHED: {
    label: "Plan limit",
    shortLabel: "PL",
    tone: "warning",
  },
  TEAM_INVITATION: {
    label: "Team invitation",
    shortLabel: "TI",
    tone: "info",
  },
  REPORT_READY: {
    label: "Report ready",
    shortLabel: "RR",
    tone: "info",
  },
  INVITATION_RECEIVED: {
    label: "Invitation",
    shortLabel: "IN",
    tone: "info",
  },
  SUBSCRIPTION_UPDATED: {
    label: "Subscription",
    shortLabel: "SU",
    tone: "neutral",
  },
  SYSTEM: {
    label: "System",
    shortLabel: "SY",
    tone: "neutral",
  },
};

const fallbackPresentation: NotificationPresentation = {
  label: "Notification",
  shortLabel: "NT",
  tone: "neutral",
};

export function getNotificationPresentation(
  type: NotificationTypeValue,
): NotificationPresentation {
  return presentations[type] ?? fallbackPresentation;
}
