export type PublicAuditLifecycleStatus =
  | "QUEUED"
  | "INITIALIZING"
  | "CRAWLING"
  | "ANALYZING"
  | "SCORING"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PublicAuditScoreCategory =
  "OVERALL" | "SEO" | "PERFORMANCE" | "ACCESSIBILITY" | "SECURITY";

export type PublicAuditView = {
  token: string;
  website: { url: string; hostname: string };
  status: PublicAuditLifecycleStatus;
  currentStage: PublicAuditLifecycleStatus;
  progress: number;
  message: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  scores: Array<{
    category: PublicAuditScoreCategory;
    score: number | null;
    evaluated: boolean;
  }>;
  topIssues: Array<{
    category: string;
    severity: "CRITICAL" | "WARNING" | "RECOMMENDATION";
    title: string;
    recommendation: string;
    affectedPageCount: number;
  }>;
  expiresAt: string;
};

export type PublicAuditApiSuccess<T> = { data: T };
export type PublicAuditApiError = {
  error: string;
  fieldErrors?: { url?: string[] };
};
