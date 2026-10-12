import "server-only";

import {
  getWorkspaceEntitlementContext,
  getWorkspaceEntitlements,
  getCurrentUsagePeriod,
  releaseWorkspaceUsage,
  reserveWorkspaceUsage,
  type UsageReservation,
  type WorkspaceEntitlementContext,
  type WorkspacePlanResolution,
} from "@website-audit/database";
import {
  canCreateClient,
  canGenerateReport,
  getMaxCrawlPages,
  UsageMetric,
  type PlanTier,
  type UsageMetric as UsageMetricValue,
} from "@website-audit/shared";
import { webLogger } from "../logging/logger";

export type PlanEntitlementErrorCode =
  | "WEBSITE_LIMIT_REACHED"
  | "MONTHLY_AUDIT_LIMIT_REACHED"
  | "CRAWL_PAGE_LIMIT_EXCEEDED"
  | "BILLING_PAGE_LIMIT_REACHED"
  | "REPORT_GENERATION_LIMIT_REACHED"
  | "SCHEDULED_AUDIT_LIMIT_REACHED"
  | "CLIENT_FEATURE_NOT_AVAILABLE"
  | "CLIENT_LIMIT_REACHED";

export type ReservedPlanCapacity = {
  context: WorkspaceEntitlementContext;
  reservation: UsageReservation;
};

export type ReservedAuditCapacity = {
  context: WorkspaceEntitlementContext;
  reservations: readonly UsageReservation[];
};

export class PlanEntitlementError extends Error {
  readonly code: PlanEntitlementErrorCode;
  readonly plan: PlanTier;
  readonly metric: UsageMetricValue;
  readonly used: number;
  readonly limit: number;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;

  constructor(input: {
    code: PlanEntitlementErrorCode;
    plan: PlanTier;
    metric: UsageMetricValue;
    used: number;
    limit: number;
    periodStart?: Date;
    periodEnd?: Date;
    message: string;
  }) {
    super(input.message);
    this.name = "PlanEntitlementError";
    this.code = input.code;
    this.plan = input.plan;
    this.metric = input.metric;
    this.used = input.used;
    this.limit = input.limit;
    this.periodStart = input.periodStart ?? null;
    this.periodEnd = input.periodEnd ?? null;
  }
}

export function getWorkspacePlan(
  workspaceId: string,
): Promise<WorkspacePlanResolution> {
  return getWorkspaceEntitlements(workspaceId);
}

export function getWorkspacePlanContext(
  workspaceId: string,
): Promise<WorkspaceEntitlementContext> {
  return getWorkspaceEntitlementContext(workspaceId);
}

/** Server-issued extra allowance for the active billing period. */
export function getEffectiveUsageLimit(
  context: WorkspaceEntitlementContext,
  metric: UsageMetricValue,
  baseLimit: number,
): number {
  return Math.max(0, baseLimit + (context.usage.offlineCredits[metric] ?? 0));
}

export async function requireWebsiteCapacity(
  workspaceId: string,
): Promise<ReservedPlanCapacity> {
  const context = await getWorkspaceEntitlementContext(workspaceId);
  const limit = getEffectiveUsageLimit(
    context,
    UsageMetric.WEBSITES,
    context.entitlements.limits.websites,
  );
  if (context.usage.activeWebsites >= limit) {
    throw new PlanEntitlementError({
      code: "WEBSITE_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.WEBSITES,
      used: context.usage.activeWebsites,
      limit,
      message: `${context.plan} allows ${limit} active website${limit === 1 ? "" : "s"}. Archive an existing website or upgrade your plan.`,
    });
  }
  const period = getCurrentUsagePeriod();
  const result = await reserveWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.WEBSITES,
    period,
    limit,
    baselineQuantity: context.usage.activeWebsites,
  });
  if (!result.allowed) {
    throw new PlanEntitlementError({
      code: "WEBSITE_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.WEBSITES,
      used: result.used,
      limit: result.limit,
      message: `${context.plan} allows ${result.limit} active website${result.limit === 1 ? "" : "s"}. Archive an existing website or upgrade your plan.`,
    });
  }
  return { context, reservation: result.reservation };
}

export async function requireAuditCapacity(input: {
  workspaceId: string;
  requestedPages: number;
}): Promise<ReservedAuditCapacity> {
  const context = await getWorkspaceEntitlementContext(input.workspaceId);
  const auditLimit = getEffectiveUsageLimit(
    context,
    UsageMetric.AUDITS,
    context.entitlements.limits.monthlyAudits,
  );
  if (context.usage.monthlyAudits >= auditLimit) {
    throw new PlanEntitlementError({
      code: "MONTHLY_AUDIT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.AUDITS,
      used: context.usage.monthlyAudits,
      limit: auditLimit,
      periodStart: context.usage.periodStart,
      periodEnd: context.usage.periodEnd,
      message: `${context.plan} has reached its audit limit of ${auditLimit} for this billing period.`,
    });
  }
  const maximumPages = getMaxCrawlPages(context.entitlements);
  if (input.requestedPages > maximumPages) {
    throw new PlanEntitlementError({
      code: "CRAWL_PAGE_LIMIT_EXCEEDED",
      plan: context.plan,
      metric: UsageMetric.PAGES_CRAWLED,
      used: input.requestedPages,
      limit: maximumPages,
      message: `${context.plan} supports up to ${maximumPages} pages per audit.`,
    });
  }
  const billingPageLimit = getEffectiveUsageLimit(
    context,
    UsageMetric.PAGES_CRAWLED,
    context.entitlements.limits.crawledPagesPerBillingPeriod,
  );
  if (context.usage.pagesCrawled + input.requestedPages > billingPageLimit) {
    throw new PlanEntitlementError({
      code: "BILLING_PAGE_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.PAGES_CRAWLED,
      used: context.usage.pagesCrawled,
      limit: billingPageLimit,
      periodStart: context.usage.periodStart,
      periodEnd: context.usage.periodEnd,
      message: `${context.plan} has reached its crawl-page allowance for this billing period.`,
    });
  }
  const period = {
    start: context.usage.periodStart,
    end: context.usage.periodEnd,
  };
  const auditResult = await reserveWorkspaceUsage({
    workspaceId: input.workspaceId,
    metric: UsageMetric.AUDITS,
    period,
    limit: auditLimit,
    baselineQuantity: context.usage.monthlyAudits,
  });
  if (!auditResult.allowed) {
    throw new PlanEntitlementError({
      code: "MONTHLY_AUDIT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.AUDITS,
      used: auditResult.used,
      limit: auditResult.limit,
      periodStart: period.start,
      periodEnd: period.end,
      message: `${context.plan} has reached its monthly audit limit of ${auditResult.limit}.`,
    });
  }

  const pageResult = await reserveWorkspaceUsage({
    workspaceId: input.workspaceId,
    metric: UsageMetric.PAGES_CRAWLED,
    period,
    quantity: input.requestedPages,
    limit: billingPageLimit,
    baselineQuantity: context.usage.pagesCrawled,
  });
  if (!pageResult.allowed) {
    await rollbackPlanCapacity(auditResult.reservation);
    throw new PlanEntitlementError({
      code: "BILLING_PAGE_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.PAGES_CRAWLED,
      used: pageResult.used,
      limit: pageResult.limit,
      periodStart: period.start,
      periodEnd: period.end,
      message: `${context.plan} has reached its crawl-page allowance for this billing period.`,
    });
  }
  return {
    context,
    reservations: [auditResult.reservation, pageResult.reservation],
  };
}

/** Counts a signed-in five-page public snapshot against the account audit limit. */
export async function requirePublicAuditCapacity(
  workspaceId: string,
): Promise<UsageReservation> {
  const context = await getWorkspaceEntitlementContext(workspaceId);
  const limit = getEffectiveUsageLimit(
    context,
    UsageMetric.AUDITS,
    context.entitlements.limits.monthlyAudits,
  );
  const period = {
    start: context.usage.periodStart,
    end: context.usage.periodEnd,
  };
  const result = await reserveWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.AUDITS,
    period,
    limit,
    baselineQuantity: context.usage.monthlyAudits,
  });
  if (!result.allowed) {
    throw new PlanEntitlementError({
      code: "MONTHLY_AUDIT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.AUDITS,
      used: result.used,
      limit: result.limit,
      periodStart: period.start,
      periodEnd: period.end,
      message: `${context.plan} has reached its monthly audit limit of ${result.limit}.`,
    });
  }
  return result.reservation;
}

export async function requireReportCapacity(
  workspaceId: string,
): Promise<ReservedPlanCapacity> {
  const context = await getWorkspaceEntitlementContext(workspaceId);
  const reportLimit = getEffectiveUsageLimit(
    context,
    UsageMetric.REPORT_GENERATIONS,
    context.entitlements.limits.reportGenerations,
  );
  if (
    !canGenerateReport(
      {
        ...context.entitlements,
        limits: {
          ...context.entitlements.limits,
          reportGenerations: reportLimit,
        },
      },
      context.usage.reportGenerations,
    )
  ) {
    throw new PlanEntitlementError({
      code: "REPORT_GENERATION_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.REPORT_GENERATIONS,
      used: context.usage.reportGenerations,
      limit: reportLimit,
      periodStart: context.usage.periodStart,
      periodEnd: context.usage.periodEnd,
      message: `${context.plan} has reached its report-generation limit for this billing period.`,
    });
  }
  const period = {
    start: context.usage.periodStart,
    end: context.usage.periodEnd,
  };
  const result = await reserveWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.REPORT_GENERATIONS,
    period,
    limit: reportLimit,
    baselineQuantity: context.usage.reportGenerations,
  });
  if (!result.allowed) {
    throw new PlanEntitlementError({
      code: "REPORT_GENERATION_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.REPORT_GENERATIONS,
      used: result.used,
      limit: result.limit,
      periodStart: period.start,
      periodEnd: period.end,
      message: `${context.plan} has reached its report-generation limit for this billing period.`,
    });
  }
  return { context, reservation: result.reservation };
}

export async function requireScheduledAuditCapacity(
  workspaceId: string,
): Promise<ReservedPlanCapacity> {
  const context = await getWorkspaceEntitlementContext(workspaceId);
  const scheduledAuditLimit = getEffectiveUsageLimit(
    context,
    UsageMetric.SCHEDULED_AUDITS,
    context.entitlements.limits.scheduledAudits,
  );
  if (
    !context.entitlements.features.scheduledAudits ||
    context.usage.scheduledAudits >= scheduledAuditLimit
  ) {
    throw new PlanEntitlementError({
      code: "SCHEDULED_AUDIT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.SCHEDULED_AUDITS,
      used: context.usage.scheduledAudits,
      limit: scheduledAuditLimit,
      message: `${context.plan} does not have capacity for another scheduled audit.`,
    });
  }
  const period = getCurrentUsagePeriod();
  const result = await reserveWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.SCHEDULED_AUDITS,
    period,
    limit: scheduledAuditLimit,
    baselineQuantity: context.usage.scheduledAudits,
  });
  if (!result.allowed) {
    throw new PlanEntitlementError({
      code: "SCHEDULED_AUDIT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.SCHEDULED_AUDITS,
      used: result.used,
      limit: result.limit,
      message: `${context.plan} does not have capacity for another scheduled audit.`,
    });
  }
  return { context, reservation: result.reservation };
}

export async function requireClientAccess(
  workspaceId: string,
): Promise<WorkspaceEntitlementContext> {
  const context = await getWorkspaceEntitlementContext(workspaceId);
  if (!context.entitlements.features.clients) {
    throw new PlanEntitlementError({
      code: "CLIENT_FEATURE_NOT_AVAILABLE",
      plan: context.plan,
      metric: UsageMetric.CLIENTS,
      used: context.usage.clients,
      limit: context.entitlements.limits.clients,
      message: "Client management is available on the AGENCY plan.",
    });
  }
  return context;
}

export async function requireClientCapacity(
  workspaceId: string,
): Promise<ReservedPlanCapacity> {
  const context = await requireClientAccess(workspaceId);
  const clientLimit = getEffectiveUsageLimit(
    context,
    UsageMetric.CLIENTS,
    context.entitlements.limits.clients,
  );
  if (
    !canCreateClient(
      {
        ...context.entitlements,
        limits: {
          ...context.entitlements.limits,
          clients: clientLimit,
        },
      },
      context.usage.clients,
    )
  ) {
    throw new PlanEntitlementError({
      code: "CLIENT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.CLIENTS,
      used: context.usage.clients,
      limit: clientLimit,
      message: `${context.plan} has reached its active client limit of ${clientLimit}.`,
    });
  }
  const period = getCurrentUsagePeriod();
  const result = await reserveWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.CLIENTS,
    period,
    limit: clientLimit,
    baselineQuantity: context.usage.clients,
  });
  if (!result.allowed) {
    throw new PlanEntitlementError({
      code: "CLIENT_LIMIT_REACHED",
      plan: context.plan,
      metric: UsageMetric.CLIENTS,
      used: result.used,
      limit: result.limit,
      message: `${context.plan} has reached its active client limit of ${result.limit}.`,
    });
  }
  return { context, reservation: result.reservation };
}

export function releasePlanCapacity(
  reservation: UsageReservation,
): Promise<boolean> {
  return releaseWorkspaceUsage(reservation);
}

export async function rollbackPlanCapacity(
  reservation: UsageReservation,
): Promise<void> {
  try {
    await releaseWorkspaceUsage(reservation);
  } catch (error) {
    webLogger("error", "usage.reservation_rollback_failed", {
      workspaceId: reservation.workspaceId,
      metric: reservation.metric,
      error,
    });
  }
}

export async function rollbackPlanCapacities(
  reservations: readonly UsageReservation[],
): Promise<void> {
  await Promise.all(reservations.map(rollbackPlanCapacity));
}

export function releaseWebsiteCapacity(workspaceId: string): Promise<boolean> {
  return releaseWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.WEBSITES,
    period: getCurrentUsagePeriod(),
    quantity: 1,
  });
}

export function releaseScheduledAuditCapacity(
  workspaceId: string,
): Promise<boolean> {
  return releaseWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.SCHEDULED_AUDITS,
    period: getCurrentUsagePeriod(),
    quantity: 1,
  });
}

export function releaseClientCapacity(workspaceId: string): Promise<boolean> {
  return releaseWorkspaceUsage({
    workspaceId,
    metric: UsageMetric.CLIENTS,
    period: getCurrentUsagePeriod(),
    quantity: 1,
  });
}
