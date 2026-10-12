export type AuditLifecycleStatus =
  | "QUEUED"
  | "INITIALIZING"
  | "CRAWLING"
  | "ANALYZING"
  | "SCORING"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AuditJobView = {
  auditId: string;
  websiteId: string;
  status: AuditLifecycleStatus;
  progress: number;
  currentStage: AuditLifecycleStatus;
  pagesDiscovered: number;
  pagesCrawled: number;
  message: string;
  attempts: number;
  maxAttempts: number;
  failureReason: string | null;
  failureCode: string | null;
  failureStage: AuditLifecycleStatus | null;
  failureStep: string | null;
  runAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditApiSuccess<T> = { data: T };
export type AuditApiError =
  | { error: string; fieldErrors?: Record<string, string[]> }
  | UsageLimitApiError;
import type { UsageLimitApiError } from "../entitlements/types";
