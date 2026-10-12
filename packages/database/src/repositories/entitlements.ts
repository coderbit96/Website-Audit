import {
  PlanTier,
  getEntitlements,
  isKnownPlanTier,
  resolvePlanTier,
  type PlanEntitlements,
  type PlanTier as PlanTierValue,
  type UsageMetric as UsageMetricValue,
} from "@website-audit/shared";
import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  ReportGenerationStatus,
  SubscriptionStatus,
  type SubscriptionStatus as SubscriptionStatusValue,
} from "../enums.js";
import {
  AuditModel,
  ClientModel,
  PlanModel,
  ReportModel,
  ScheduledAuditModel,
  SubscriptionModel,
  UsageRecordModel,
  UsageCreditModel,
  WebsiteModel,
  WorkspaceMemberModel,
} from "../models.js";
import { addUtcMonths } from "./payments.js";

const entitledSubscriptionStatuses = new Set<SubscriptionStatusValue>([
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
]);

export type WorkspacePlanResolution = {
  plan: PlanTierValue;
  entitlements: PlanEntitlements;
  source: "FREE_FALLBACK" | "SUBSCRIPTION";
  subscriptionStatus: SubscriptionStatusValue | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export type WorkspaceEntitlementUsage = {
  activeWebsites: number;
  monthlyAudits: number;
  pagesCrawled: number;
  reportGenerations: number;
  scheduledAudits: number;
  workspaceMembers: number;
  clients: number;
  offlineCredits: Record<UsageMetricValue, number>;
  periodStart: Date;
  periodEnd: Date;
};

function emptyOfflineCredits(): Record<UsageMetricValue, number> {
  return {
    AUDITS: 0,
    PAGES_CRAWLED: 0,
    WEBSITES: 0,
    REPORT_GENERATIONS: 0,
    SCHEDULED_AUDITS: 0,
    CLIENTS: 0,
  };
}

export type WorkspaceEntitlementContext = WorkspacePlanResolution & {
  usage: WorkspaceEntitlementUsage;
};

export function resolveSubscriptionPlanTier(input: {
  subscriptionStatus: SubscriptionStatusValue | null;
  planSlug: string | null;
  planActive: boolean;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  now?: Date;
}): PlanTierValue {
  const now = input.now ?? new Date();
  if (!subscriptionGrantsPlan(input, now)) {
    return PlanTier.FREE;
  }
  return resolvePlanTier(input.planSlug);
}

function subscriptionGrantsPlan(
  input: {
    subscriptionStatus: SubscriptionStatusValue | null;
    planSlug: string | null;
    planActive: boolean;
    currentPeriodEnd?: Date | null;
    trialEndsAt?: Date | null;
  },
  now: Date,
): boolean {
  const normalizedPlanSlug = input.planSlug?.trim().toUpperCase();
  if (
    !input.subscriptionStatus ||
    !entitledSubscriptionStatuses.has(input.subscriptionStatus) ||
    !input.planActive ||
    !isKnownPlanTier(normalizedPlanSlug)
  ) {
    return false;
  }
  if (input.currentPeriodEnd && input.currentPeriodEnd <= now) {
    return false;
  }
  if (
    input.subscriptionStatus === SubscriptionStatus.TRIALING &&
    input.trialEndsAt &&
    input.trialEndsAt <= now
  ) {
    return false;
  }
  return true;
}

export function getCalendarMonthWindow(now = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/** Monthly usage windows stay monthly even when prepaid access is extended. */
export function getSubscriptionUsageWindow(
  start: Date,
  accessEnd: Date,
  now: Date,
): { start: Date; end: Date } {
  const elapsedMonths = Math.max(
    0,
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      start.getUTCMonth(),
  );
  const monthIndex =
    addUtcMonths(start, elapsedMonths) > now
      ? Math.max(0, elapsedMonths - 1)
      : elapsedMonths;
  const periodStart = addUtcMonths(start, monthIndex);
  const next = addUtcMonths(start, monthIndex + 1);
  return { start: periodStart, end: next < accessEnd ? next : accessEnd };
}

function freeResolution(): WorkspacePlanResolution {
  return {
    plan: PlanTier.FREE,
    entitlements: getEntitlements(PlanTier.FREE),
    source: "FREE_FALLBACK",
    subscriptionStatus: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
}

/** Resolves the authoritative workspace plan; missing/invalid state is FREE. */
export async function getWorkspaceEntitlements(
  workspaceId: string,
  now = new Date(),
): Promise<WorkspacePlanResolution> {
  if (!Types.ObjectId.isValid(workspaceId)) return freeResolution();
  await connectToDatabase();

  const subscription = await SubscriptionModel.findOne({ workspaceId })
    .select({
      planId: 1,
      status: 1,
      currentPeriodStart: 1,
      currentPeriodEnd: 1,
      trialEndsAt: 1,
    })
    .lean()
    .exec();
  if (!subscription) return freeResolution();

  const plan = await PlanModel.findById(subscription.planId)
    .select({ slug: 1, isActive: 1 })
    .lean()
    .exec();
  const subscriptionSnapshot = {
    subscriptionStatus: subscription.status,
    planSlug: plan?.slug ?? null,
    planActive: plan?.isActive === true,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
  };
  const tier = resolveSubscriptionPlanTier({ ...subscriptionSnapshot, now });
  const entitled = subscriptionGrantsPlan(subscriptionSnapshot, now);
  return {
    plan: tier,
    entitlements: getEntitlements(tier),
    source: entitled ? "SUBSCRIPTION" : "FREE_FALLBACK",
    subscriptionStatus: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
  };
}

/** Adds current usage required by entitlement decision functions. */
export async function getWorkspaceEntitlementContext(
  workspaceId: string,
  now = new Date(),
): Promise<WorkspaceEntitlementContext> {
  const resolution = await getWorkspaceEntitlements(workspaceId, now);
  const calendar = getCalendarMonthWindow(now);
  const usesSubscriptionPeriod =
    resolution.source === "SUBSCRIPTION" &&
    resolution.currentPeriodStart &&
    resolution.currentPeriodEnd &&
    resolution.currentPeriodStart <= now &&
    resolution.currentPeriodEnd > now;
  const period = usesSubscriptionPeriod
    ? getSubscriptionUsageWindow(
        resolution.currentPeriodStart!,
        resolution.currentPeriodEnd!,
        now,
      )
    : calendar;
  const periodStart = period.start;
  const periodEnd = period.end;

  if (!Types.ObjectId.isValid(workspaceId)) {
    return {
      ...resolution,
      usage: {
        activeWebsites: 0,
        monthlyAudits: 0,
        pagesCrawled: 0,
        reportGenerations: 0,
        scheduledAudits: 0,
        workspaceMembers: 0,
        clients: 0,
        offlineCredits: emptyOfflineCredits(),
        periodStart,
        periodEnd,
      },
    };
  }

  const workspaceObjectId = new Types.ObjectId(workspaceId);
  const [
    activeWebsites,
    auditUsageGroups,
    reportGenerations,
    reservedUsage,
    scheduledAudits,
    workspaceMembers,
    clients,
    usageCreditGroups,
  ] = await Promise.all([
    WebsiteModel.countDocuments({
      workspaceId: workspaceObjectId,
      isActive: true,
    }),
    AuditModel.aggregate<{ monthlyAudits: number; pagesCrawled: number }>([
      {
        $match: {
          workspaceId: workspaceObjectId,
          createdAt: { $gte: periodStart, $lt: periodEnd },
        },
      },
      {
        $group: {
          _id: null,
          monthlyAudits: { $sum: 1 },
          pagesCrawled: { $sum: "$pagesCrawled" },
        },
      },
    ]).exec(),
    ReportModel.countDocuments({
      workspaceId: workspaceObjectId,
      status: {
        $in: [
          ReportGenerationStatus.GENERATING,
          ReportGenerationStatus.COMPLETED,
        ],
      },
      createdAt: { $gte: periodStart, $lt: periodEnd },
    }),
    UsageRecordModel.find({
      workspaceId: workspaceObjectId,
      metric: { $in: ["AUDITS", "REPORT_GENERATIONS"] },
      periodStart,
      periodEnd,
    })
      .select({ metric: 1, quantity: 1 })
      .lean()
      .exec(),
    ScheduledAuditModel.countDocuments({
      workspaceId: workspaceObjectId,
      isActive: true,
    }),
    WorkspaceMemberModel.countDocuments({ workspaceId: workspaceObjectId }),
    ClientModel.countDocuments({
      workspaceId: workspaceObjectId,
      isActive: { $ne: false },
    }),
    UsageCreditModel.aggregate<{
      _id: UsageMetricValue;
      quantity: number;
    }>([
      {
        $match: {
          workspaceId: workspaceObjectId,
          periodStart: { $lte: now },
          periodEnd: { $gt: now },
        },
      },
      { $group: { _id: "$metric", quantity: { $sum: "$quantity" } } },
    ]).exec(),
  ]);
  const auditUsage = auditUsageGroups[0] ?? {
    monthlyAudits: 0,
    pagesCrawled: 0,
  };
  const offlineCredits = emptyOfflineCredits();
  const reservedAuditCount =
    reservedUsage.find((record) => record.metric === "AUDITS")?.quantity ?? 0;
  const reservedReportCount =
    reservedUsage.find((record) => record.metric === "REPORT_GENERATIONS")
      ?.quantity ?? 0;
  for (const group of usageCreditGroups) {
    if (group._id in offlineCredits) {
      offlineCredits[group._id] = Math.max(0, group.quantity);
    }
  }

  return {
    ...resolution,
    usage: {
      activeWebsites,
      monthlyAudits: Math.max(auditUsage.monthlyAudits, reservedAuditCount),
      pagesCrawled: auditUsage.pagesCrawled,
      reportGenerations: Math.max(reportGenerations, reservedReportCount),
      scheduledAudits,
      workspaceMembers,
      clients,
      offlineCredits,
      periodStart,
      periodEnd,
    },
  };
}
