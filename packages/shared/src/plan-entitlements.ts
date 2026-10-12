export const PlanTier = {
  FREE: "FREE",
  PRO: "PRO",
  AGENCY: "AGENCY",
} as const;

export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export const UsageMetric = {
  AUDITS: "AUDITS",
  PAGES_CRAWLED: "PAGES_CRAWLED",
  WEBSITES: "WEBSITES",
  REPORT_GENERATIONS: "REPORT_GENERATIONS",
  SCHEDULED_AUDITS: "SCHEDULED_AUDITS",
  CLIENTS: "CLIENTS",
} as const;

export type UsageMetric = (typeof UsageMetric)[keyof typeof UsageMetric];

export const PdfReportLevel = {
  BASIC: "BASIC",
  FULL: "FULL",
} as const;

export type PdfReportLevel =
  (typeof PdfReportLevel)[keyof typeof PdfReportLevel];

export type PlanEntitlements = Readonly<{
  plan: PlanTier;
  limits: Readonly<{
    websites: number;
    monthlyAudits: number;
    crawledPagesPerBillingPeriod: number;
    crawlPagesPerAudit: number;
    reportGenerations: number;
    scheduledAudits: number;
    workspaceMembers: number;
    clients: number;
  }>;
  features: Readonly<{
    scheduledAudits: boolean;
    auditHistory: boolean;
    auditComparison: boolean;
    fullReports: boolean;
    clients: boolean;
    team: boolean;
    whiteLabel: boolean;
    priorityQueue: boolean;
  }>;
  pdfReportLevel: PdfReportLevel;
  auditQueuePriority: number;
}>;

const PLAN_ENTITLEMENTS = Object.freeze({
  FREE: Object.freeze({
    plan: PlanTier.FREE,
    limits: Object.freeze({
      websites: 1,
      monthlyAudits: 3,
      crawledPagesPerBillingPeriod: 30,
      crawlPagesPerAudit: 10,
      reportGenerations: 3,
      scheduledAudits: 0,
      workspaceMembers: 1,
      clients: 0,
    }),
    features: Object.freeze({
      scheduledAudits: false,
      auditHistory: false,
      auditComparison: false,
      fullReports: false,
      clients: false,
      team: false,
      whiteLabel: false,
      priorityQueue: false,
    }),
    pdfReportLevel: PdfReportLevel.BASIC,
    auditQueuePriority: 0,
  }),
  PRO: Object.freeze({
    plan: PlanTier.PRO,
    limits: Object.freeze({
      websites: 5,
      monthlyAudits: 50,
      crawledPagesPerBillingPeriod: 25_000,
      crawlPagesPerAudit: 500,
      reportGenerations: 100,
      scheduledAudits: 10,
      workspaceMembers: 1,
      clients: 0,
    }),
    features: Object.freeze({
      scheduledAudits: true,
      auditHistory: true,
      auditComparison: true,
      fullReports: true,
      clients: false,
      team: false,
      whiteLabel: false,
      priorityQueue: false,
    }),
    pdfReportLevel: PdfReportLevel.FULL,
    auditQueuePriority: 0,
  }),
  AGENCY: Object.freeze({
    plan: PlanTier.AGENCY,
    limits: Object.freeze({
      websites: 50,
      monthlyAudits: 250,
      crawledPagesPerBillingPeriod: 125_000,
      // The crawler's current audited safety ceiling remains 500 pages.
      crawlPagesPerAudit: 500,
      reportGenerations: 500,
      scheduledAudits: 100,
      workspaceMembers: 20,
      clients: 100,
    }),
    features: Object.freeze({
      scheduledAudits: true,
      auditHistory: true,
      auditComparison: true,
      fullReports: true,
      clients: true,
      team: true,
      whiteLabel: true,
      priorityQueue: true,
    }),
    pdfReportLevel: PdfReportLevel.FULL,
    auditQueuePriority: 10,
  }),
}) satisfies Readonly<Record<PlanTier, PlanEntitlements>>;

export function isKnownPlanTier(
  value: string | null | undefined,
): value is PlanTier {
  return Boolean(value && Object.hasOwn(PLAN_ENTITLEMENTS, value));
}

export function resolvePlanTier(value: string | null | undefined): PlanTier {
  const normalized = value?.trim().toUpperCase();
  return isKnownPlanTier(normalized) ? normalized : PlanTier.FREE;
}

export function getEntitlements(plan: PlanTier): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function canCreateWebsite(
  entitlements: PlanEntitlements,
  currentActiveWebsites: number,
): boolean {
  return currentActiveWebsites < entitlements.limits.websites;
}

export function canRunAudit(
  entitlements: PlanEntitlements,
  currentMonthlyAudits: number,
): boolean {
  return currentMonthlyAudits < entitlements.limits.monthlyAudits;
}

export function getMaxCrawlPages(entitlements: PlanEntitlements): number {
  return entitlements.limits.crawlPagesPerAudit;
}

export function canConsumeCrawlPages(
  entitlements: PlanEntitlements,
  currentCrawledPages: number,
  requestedPages: number,
): boolean {
  return (
    requestedPages >= 0 &&
    currentCrawledPages + requestedPages <=
      entitlements.limits.crawledPagesPerBillingPeriod
  );
}

export function canGenerateReport(
  entitlements: PlanEntitlements,
  currentReportGenerations: number,
): boolean {
  return currentReportGenerations < entitlements.limits.reportGenerations;
}

export function canScheduleAudit(
  entitlements: PlanEntitlements,
  currentScheduledAudits = 0,
): boolean {
  return (
    entitlements.features.scheduledAudits &&
    currentScheduledAudits < entitlements.limits.scheduledAudits
  );
}

export function canUseWhiteLabel(entitlements: PlanEntitlements): boolean {
  return entitlements.features.whiteLabel;
}

export function canInviteTeamMember(
  entitlements: PlanEntitlements,
  currentWorkspaceMembers: number,
): boolean {
  return (
    entitlements.features.team &&
    currentWorkspaceMembers < entitlements.limits.workspaceMembers
  );
}

export function canCreateClient(
  entitlements: PlanEntitlements,
  currentClients: number,
): boolean {
  return (
    entitlements.features.clients &&
    currentClients < entitlements.limits.clients
  );
}

export function canAccessAuditHistory(entitlements: PlanEntitlements): boolean {
  return entitlements.features.auditHistory;
}

export function canCompareAudits(entitlements: PlanEntitlements): boolean {
  return entitlements.features.auditComparison;
}

export function canGenerateFullReport(entitlements: PlanEntitlements): boolean {
  return entitlements.features.fullReports;
}

export function getAuditQueuePriority(entitlements: PlanEntitlements): number {
  return entitlements.auditQueuePriority;
}
