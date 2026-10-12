export const UserRole = {
  USER: "USER",
  // Retained for backwards compatibility. Global administration now requires
  // the explicit SUPER_ADMIN role.
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const WorkspaceRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

export const AuditStatus = {
  QUEUED: "QUEUED",
  INITIALIZING: "INITIALIZING",
  CRAWLING: "CRAWLING",
  ANALYZING: "ANALYZING",
  SCORING: "SCORING",
  GENERATING_REPORT: "GENERATING_REPORT",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];

export const AuditType = {
  QUICK: "QUICK",
  STANDARD: "STANDARD",
  FULL: "FULL",
  // Retained for compatibility with audits created before preset support.
  FULL_SITE: "FULL_SITE",
  SINGLE_PAGE: "SINGLE_PAGE",
} as const;
export type AuditType = (typeof AuditType)[keyof typeof AuditType];

export const FindingSeverity = {
  CRITICAL: "CRITICAL",
  WARNING: "WARNING",
  RECOMMENDATION: "RECOMMENDATION",
  PASSED: "PASSED",
} as const;
export type FindingSeverity =
  (typeof FindingSeverity)[keyof typeof FindingSeverity];

export const FindingStatus = {
  OPEN: "OPEN",
  IGNORED: "IGNORED",
  FIXED: "FIXED",
  REOPENED: "REOPENED",
} as const;
export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

export const AuditCategory = {
  SEO: "SEO",
  TECHNICAL: "TECHNICAL",
  PERFORMANCE: "PERFORMANCE",
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  MOBILE: "MOBILE",
  CONTENT: "CONTENT",
} as const;
export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

export const AuditScoreCategory = {
  OVERALL: "OVERALL",
  SEO: "SEO",
  TECHNICAL: "TECHNICAL",
  PERFORMANCE: "PERFORMANCE",
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  MOBILE: "MOBILE",
} as const;
export type AuditScoreCategory =
  (typeof AuditScoreCategory)[keyof typeof AuditScoreCategory];

export const SubscriptionStatus = {
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const NotificationType = {
  AUDIT_COMPLETED: "AUDIT_COMPLETED",
  AUDIT_FAILED: "AUDIT_FAILED",
  SCORE_DROPPED: "SCORE_DROPPED",
  CRITICAL_ISSUE_FOUND: "CRITICAL_ISSUE_FOUND",
  SCHEDULED_AUDIT_COMPLETED: "SCHEDULED_AUDIT_COMPLETED",
  SUBSCRIPTION_LIMIT_REACHED: "SUBSCRIPTION_LIMIT_REACHED",
  TEAM_INVITATION: "TEAM_INVITATION",
  REPORT_READY: "REPORT_READY",
  // Retained so existing notification records remain readable.
  INVITATION_RECEIVED: "INVITATION_RECEIVED",
  SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
  SYSTEM: "SYSTEM",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const ReportGenerationStatus = {
  GENERATING: "GENERATING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type ReportGenerationStatus =
  (typeof ReportGenerationStatus)[keyof typeof ReportGenerationStatus];

export { UsageMetric } from "@website-audit/shared";

export const LeadRequestedService = {
  FULL_REPORT: "FULL_REPORT",
  WEBSITE_FIX: "WEBSITE_FIX",
  SEO: "SEO",
  PERFORMANCE: "PERFORMANCE",
  CONTACT: "CONTACT",
} as const;
export type LeadRequestedService =
  (typeof LeadRequestedService)[keyof typeof LeadRequestedService];

export const LeadSource = {
  PUBLIC_AUDIT: "PUBLIC_AUDIT",
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];
