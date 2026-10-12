import { Types, type ClientSession } from "mongoose";
import { createHash } from "node:crypto";
import type { UsageMetric as UsageMetricValue } from "@website-audit/shared";
import { formatPlanMonthlyPrice, isKnownPlanTier } from "@website-audit/shared";

import {
  connectToDatabase,
  getDatabaseConnectionState,
} from "../connection.js";
import { AuditStatus, UsageMetric } from "../enums.js";
import {
  ActivityLogModel,
  AuditJobModel,
  AuditModel,
  AuditPageModel,
  LeadModel,
  PaymentOrderModel,
  PlanModel,
  ReportModel,
  SubscriptionModel,
  UsageCreditModel,
  UsageRecordModel,
  UserModel,
  WebsiteModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "../models.js";
import { getWorkspaceEntitlementContext } from "./entitlements.js";
import { PUBLIC_AUDIT_WORKSPACE_SLUG } from "../system-workspace.js";
import { countHealthyWorkers } from "./worker-heartbeats.js";

export const ADMIN_PAGE_SIZE = 50;

export const adminSections = [
  "users",
  "workspaces",
  "subscriptions",
  "payments",
  "plans",
  "websites",
  "audits",
  "queue",
  "failed-audits",
  "usage",
  "reports",
  "leads",
  "system-health",
  "audit-rules",
  "settings",
  "logs",
] as const;

export type AdminSection = (typeof adminSections)[number];

export type AdminTableRow = {
  id: string;
  values: readonly (string | number | null)[];
};

export type AdminTableData = {
  title: string;
  description: string;
  columns: readonly string[];
  rows: readonly AdminTableRow[];
  emptyMessage: string;
  pagination?: { page: number; hasNext: boolean };
};

export type AdminOverview = {
  totalUsers: number;
  customerWorkspaces: number;
  auditsToday: number;
  pagesCrawledToday: number;
  failedAudits: number;
  queueSize: number;
  workerHealth: "ONLINE" | "OFFLINE";
  workerHealthMessage: string;
  recentLeads: readonly {
    id: string;
    name: string;
    websiteUrl: string;
    createdAt: Date;
  }[];
};

export type AdminCreditRecipient = {
  userId: string;
  label: string;
  workspaces: readonly { id: string; name: string }[];
};

function asId(value: Types.ObjectId): string {
  return value.toString();
}

function asDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function dateAtIndiaMidnight(now: Date): Date {
  const indiaOffsetMs = 330 * 60_000;
  const indiaNow = new Date(now.getTime() + indiaOffsetMs);
  return new Date(
    Date.UTC(
      indiaNow.getUTCFullYear(),
      indiaNow.getUTCMonth(),
      indiaNow.getUTCDate(),
    ) - indiaOffsetMs,
  );
}

function validId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`${field} is invalid.`);
  }
  return new Types.ObjectId(value);
}

function safeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 240) : null;
}

async function namesById(
  ids: readonly Types.ObjectId[],
  model: typeof WorkspaceModel | typeof WebsiteModel | typeof PlanModel,
  field: "name" | "url" | "slug",
): Promise<Map<string, string>> {
  const uniqueIds = [...new Map(ids.map((id) => [id.toString(), id])).values()];
  if (uniqueIds.length === 0) return new Map();
  const records = await model
    .find({ _id: { $in: uniqueIds } })
    .select({ [field]: 1 })
    .lean()
    .exec();
  return new Map(
    records.map((record) => [
      record._id.toString(),
      String(record[field] ?? "Unknown"),
    ]),
  );
}

export async function getAdminOverview(
  now = new Date(),
): Promise<AdminOverview> {
  await connectToDatabase();
  const today = dateAtIndiaMidnight(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
  const [
    totalUsers,
    customerWorkspaces,
    auditsToday,
    pagesCrawledToday,
    failedAudits,
    queueSize,
    healthyWorkers,
    recentLeads,
  ] = await Promise.all([
    UserModel.countDocuments(),
    WorkspaceModel.countDocuments({
      slug: { $ne: PUBLIC_AUDIT_WORKSPACE_SLUG },
    }),
    AuditModel.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    AuditPageModel.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    }),
    AuditModel.countDocuments({ status: AuditStatus.FAILED }),
    AuditJobModel.countDocuments({ status: AuditStatus.QUEUED }),
    countHealthyWorkers(now),
    LeadModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ name: 1, websiteUrl: 1, createdAt: 1 })
      .lean()
      .exec(),
  ]);
  const workerHealth = healthyWorkers > 0 ? "ONLINE" : "OFFLINE";
  return {
    totalUsers,
    customerWorkspaces,
    auditsToday,
    pagesCrawledToday,
    failedAudits,
    queueSize,
    workerHealth,
    workerHealthMessage:
      healthyWorkers > 0
        ? `${healthyWorkers} worker${healthyWorkers === 1 ? "" : "s"} reported recently.`
        : "No worker heartbeat was observed recently. Check the worker service.",
    recentLeads: recentLeads.map((lead) => ({
      id: asId(lead._id),
      name: lead.name,
      websiteUrl: lead.websiteUrl,
      createdAt: lead.createdAt,
    })),
  };
}

export async function listAdminCreditRecipients(
  search = "",
): Promise<readonly AdminCreditRecipient[]> {
  await connectToDatabase();
  const normalizedSearch = search.trim().slice(0, 100);
  const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = normalizedSearch
    ? {
        $or: [
          { name: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } },
        ],
      }
    : {};
  const users = await UserModel.find(filter)
    .sort({ email: 1 })
    .limit(25)
    .select({ name: 1, email: 1 })
    .lean();
  const memberships = await WorkspaceMemberModel.find({
    userId: { $in: users.map((user) => user._id) },
  })
    .select({ userId: 1, workspaceId: 1 })
    .lean();
  const workspaces = await WorkspaceModel.find({
    _id: { $in: memberships.map((membership) => membership.workspaceId) },
    slug: { $ne: PUBLIC_AUDIT_WORKSPACE_SLUG },
  })
    .select({ name: 1 })
    .lean();
  const workspaceNames = new Map(
    workspaces.map((workspace) => [asId(workspace._id), workspace.name]),
  );
  const membershipsByUser = new Map<string, { id: string; name: string }[]>();
  for (const membership of memberships) {
    const workspaceId = asId(membership.workspaceId);
    const workspaceName = workspaceNames.get(workspaceId);
    if (!workspaceName) continue;
    const userId = asId(membership.userId);
    const entries = membershipsByUser.get(userId) ?? [];
    entries.push({ id: workspaceId, name: workspaceName });
    membershipsByUser.set(userId, entries);
  }
  return users
    .map((user) => ({
      userId: asId(user._id),
      label: `${user.name?.trim() || "Unnamed user"} — ${user.email}`,
      workspaces: membershipsByUser.get(asId(user._id)) ?? [],
    }))
    .filter((recipient) => recipient.workspaces.length > 0);
}

async function createCreditRecords(
  input: {
    requestKey: string;
    workspaceId: Types.ObjectId;
    recipientUserId: Types.ObjectId;
    grantedById: Types.ObjectId;
    metric: UsageMetricValue;
    quantity: number;
    note?: string;
    periodStart: Date;
    periodEnd: Date;
  },
  session?: ClientSession,
): Promise<void> {
  const options = session ? { session } : undefined;
  const [credit] = await UsageCreditModel.create([input], options);
  if (!credit) throw new Error("MongoDB did not return the usage credit.");
  await ensureCreditActivityLog(credit, session);
}

type StoredUsageCredit = NonNullable<
  Awaited<ReturnType<typeof UsageCreditModel.findOne>>
>;

async function ensureCreditActivityLog(
  credit: StoredUsageCredit,
  session?: ClientSession,
): Promise<void> {
  await ActivityLogModel.updateOne(
    {
      action: "USAGE_CREDIT_GRANTED",
      entityType: "UsageCredit",
      entityId: credit._id.toString(),
    },
    {
      $setOnInsert: {
        workspaceId: credit.workspaceId,
        userId: credit.grantedById,
        action: "USAGE_CREDIT_GRANTED",
        entityType: "UsageCredit",
        entityId: credit._id.toString(),
        metadata: {
          recipientUserId: credit.recipientUserId.toString(),
          metric: credit.metric,
          quantity: credit.quantity,
          periodStart: credit.periodStart.toISOString(),
          periodEnd: credit.periodEnd.toISOString(),
        },
      },
    },
    session ? { upsert: true, session } : { upsert: true },
  ).exec();
}

export class UsageCreditConflictError extends Error {
  constructor() {
    super("This credit request was already used with different details.");
    this.name = "UsageCreditConflictError";
  }
}

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function transactionUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Transaction numbers are only allowed") ||
      error.message.includes("does not support retryable writes"))
  );
}

export async function grantOfflineUsageCredit(input: {
  requestId: string;
  workspaceId: string;
  recipientUserId: string;
  grantedById: string;
  metric: UsageMetricValue;
  quantity: number;
  note?: string;
}): Promise<{ periodStart: Date; periodEnd: Date; replayed: boolean }> {
  const workspaceId = validId(input.workspaceId, "Workspace identifier");
  const recipientUserId = validId(
    input.recipientUserId,
    "Recipient identifier",
  );
  const grantedById = validId(input.grantedById, "Administrator identifier");
  if (!Object.values(UsageMetric).includes(input.metric)) {
    throw new Error("Usage metric is invalid.");
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Credit quantity must be a positive whole number.");
  }
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input.requestId)) {
    throw new Error("Credit request identifier is invalid.");
  }
  await connectToDatabase();
  const requestKey = createHash("sha256")
    .update(`${input.grantedById}:${input.requestId.toLowerCase()}`)
    .digest("hex");
  const note = safeText(input.note);
  async function previousGrant() {
    const prior = await UsageCreditModel.findOne({ requestKey }).exec();
    if (!prior) return null;
    if (
      !prior.workspaceId.equals(workspaceId) ||
      !prior.recipientUserId.equals(recipientUserId) ||
      !prior.grantedById.equals(grantedById) ||
      prior.metric !== input.metric ||
      prior.quantity !== input.quantity ||
      (prior.note ?? null) !== note
    ) {
      throw new UsageCreditConflictError();
    }
    await ensureCreditActivityLog(prior);
    return {
      periodStart: prior.periodStart,
      periodEnd: prior.periodEnd,
      replayed: true,
    };
  }
  const previous = await previousGrant();
  if (previous) return previous;
  const membership = await WorkspaceMemberModel.exists({
    workspaceId,
    userId: recipientUserId,
  });
  if (!membership) {
    throw new Error("The selected user is not a member of that workspace.");
  }
  const context = await getWorkspaceEntitlementContext(workspaceId.toString());
  const record = {
    requestKey,
    workspaceId,
    recipientUserId,
    grantedById,
    metric: input.metric,
    quantity: input.quantity,
    ...(note ? { note } : {}),
    periodStart: context.usage.periodStart,
    periodEnd: context.usage.periodEnd,
  };
  const connection = await connectToDatabase();
  const session = await connection.connection.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await createCreditRecords(record, session);
      });
    } catch (error) {
      if (transactionUnavailable(error)) {
        try {
          await createCreditRecords(record);
        } catch (fallbackError) {
          if (!duplicateKey(fallbackError)) throw fallbackError;
          const replay = await previousGrant();
          if (replay) return replay;
          throw fallbackError;
        }
      } else if (duplicateKey(error)) {
        const replay = await previousGrant();
        if (replay) return replay;
        throw error;
      } else {
        throw error;
      }
    }
  } finally {
    await session.endSession();
  }
  return {
    periodStart: context.usage.periodStart,
    periodEnd: context.usage.periodEnd,
    replayed: false,
  };
}

export async function getAdminTableData(
  section: AdminSection,
  requestedPage = 1,
): Promise<AdminTableData> {
  await connectToDatabase();
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 1_000)
      : 1;
  const offset = (page - 1) * ADMIN_PAGE_SIZE;
  const paginated = (rowCount: number) => ({
    page,
    hasNext: rowCount > ADMIN_PAGE_SIZE,
  });
  if (section === "users") {
    const users = await UserModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({ name: 1, email: 1, role: 1, createdAt: 1 })
      .lean();
    const visibleUsers = users.slice(0, ADMIN_PAGE_SIZE);
    const memberCounts = await WorkspaceMemberModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { userId: { $in: visibleUsers.map((user) => user._id) } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]).exec();
    const counts = new Map(
      memberCounts.map((entry) => [asId(entry._id), entry.count]),
    );
    return {
      title: "Users",
      description:
        "The latest registered accounts and their global access roles.",
      columns: ["Name", "Email", "Role", "Workspaces", "Joined"],
      rows: visibleUsers.map((user) => ({
        id: asId(user._id),
        values: [
          user.name?.trim() || "Unnamed user",
          user.email,
          user.role,
          counts.get(asId(user._id)) ?? 0,
          asDate(user.createdAt),
        ],
      })),
      emptyMessage: "No user accounts exist yet.",
      pagination: paginated(users.length),
    };
  }

  if (section === "workspaces") {
    const workspaces = await WorkspaceModel.find()
      .where("slug")
      .ne(PUBLIC_AUDIT_WORKSPACE_SLUG)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({ name: 1, slug: 1, createdAt: 1 })
      .lean();
    const visibleWorkspaces = workspaces.slice(0, ADMIN_PAGE_SIZE);
    const workspaceIds = visibleWorkspaces.map((workspace) => workspace._id);
    const [memberGroups, websiteGroups] = await Promise.all([
      WorkspaceMemberModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { workspaceId: { $in: workspaceIds } } },
        { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
      ]).exec(),
      WebsiteModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { workspaceId: { $in: workspaceIds }, isActive: true } },
        { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
      ]).exec(),
    ]);
    const memberCounts = new Map(
      memberGroups.map((group) => [asId(group._id), group.count]),
    );
    const websiteCounts = new Map(
      websiteGroups.map((group) => [asId(group._id), group.count]),
    );
    const rows = visibleWorkspaces.map((workspace) => ({
      id: asId(workspace._id),
      values: [
        workspace.name,
        workspace.slug,
        memberCounts.get(asId(workspace._id)) ?? 0,
        websiteCounts.get(asId(workspace._id)) ?? 0,
        asDate(workspace.createdAt),
      ],
    }));
    return {
      title: "Workspaces",
      description:
        "Customer workspaces, memberships, and active website counts. The internal public-audit workspace is excluded.",
      columns: ["Workspace", "Slug", "Members", "Active websites", "Created"],
      rows,
      emptyMessage: "No workspaces exist yet.",
      pagination: paginated(workspaces.length),
    };
  }

  if (section === "subscriptions") {
    const subscriptions = await SubscriptionModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        workspaceId: 1,
        planId: 1,
        status: 1,
        currentPeriodEnd: 1,
        createdAt: 1,
      })
      .lean();
    const visibleSubscriptions = subscriptions.slice(0, ADMIN_PAGE_SIZE);
    const [workspaceNames, planNames] = await Promise.all([
      namesById(
        visibleSubscriptions.map((entry) => entry.workspaceId),
        WorkspaceModel,
        "name",
      ),
      namesById(
        visibleSubscriptions.map((entry) => entry.planId),
        PlanModel,
        "name",
      ),
    ]);
    return {
      title: "Subscriptions",
      description:
        "Stored workspace entitlements, including manually activated and verified Razorpay purchases.",
      columns: ["Workspace", "Plan", "Status", "Period ends", "Created"],
      rows: visibleSubscriptions.map((subscription) => ({
        id: asId(subscription._id),
        values: [
          workspaceNames.get(asId(subscription.workspaceId)) ??
            "Unknown workspace",
          planNames.get(asId(subscription.planId)) ?? "Unknown plan",
          subscription.status,
          asDate(subscription.currentPeriodEnd),
          asDate(subscription.createdAt),
        ],
      })),
      emptyMessage: "No subscriptions are stored yet.",
      pagination: paginated(subscriptions.length),
    };
  }

  if (section === "payments") {
    const payments = await PaymentOrderModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        workspaceId: 1,
        planTier: 1,
        amountPaise: 1,
        status: 1,
        createdAt: 1,
        capturedAt: 1,
        periodEnd: 1,
      })
      .lean();
    const visible = payments.slice(0, ADMIN_PAGE_SIZE);
    const workspaceNames = await namesById(
      visible.map((entry) => entry.workspaceId),
      WorkspaceModel,
      "name",
    );
    return {
      title: "Payments",
      description:
        "Razorpay order records. Only captured payments grant paid access; refunds require operator reconciliation.",
      columns: [
        "Workspace",
        "Plan",
        "Amount (INR)",
        "Status",
        "Ordered",
        "Captured",
        "Access ends",
      ],
      rows: visible.map((payment) => ({
        id: asId(payment._id),
        values: [
          workspaceNames.get(asId(payment.workspaceId)) ?? "Unknown workspace",
          payment.planTier,
          `₹${(payment.amountPaise / 100).toLocaleString("en-IN")}`,
          payment.status,
          asDate(payment.createdAt),
          asDate(payment.capturedAt),
          asDate(payment.periodEnd),
        ],
      })),
      emptyMessage: "No Razorpay orders have been created.",
      pagination: paginated(payments.length),
    };
  }

  if (section === "plans") {
    const plans = await PlanModel.find()
      .sort({ name: 1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        name: 1,
        slug: 1,
        isActive: 1,
      })
      .lean();
    return {
      title: "Plans",
      description:
        "Public INR prices and runtime entitlements are centralized in code. Legacy stored amounts are not used for billing.",
      columns: ["Name", "Slug", "Indicative monthly (INR)", "State"],
      rows: plans.slice(0, ADMIN_PAGE_SIZE).map((plan) => {
        const tier = plan.slug.toUpperCase();
        return {
          id: asId(plan._id),
          values: [
            plan.name,
            plan.slug,
            isKnownPlanTier(tier)
              ? formatPlanMonthlyPrice(tier)
              : "Not offered",
            plan.isActive ? "Active" : "Inactive",
          ],
        };
      }),
      emptyMessage: "No plan catalog entries are stored yet.",
      pagination: paginated(plans.length),
    };
  }

  if (section === "websites") {
    const websites = await WebsiteModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({ workspaceId: 1, name: 1, url: 1, isActive: 1, createdAt: 1 })
      .lean();
    const visibleWebsites = websites.slice(0, ADMIN_PAGE_SIZE);
    const workspaceNames = await namesById(
      visibleWebsites.map((entry) => entry.workspaceId),
      WorkspaceModel,
      "name",
    );
    return {
      title: "Websites",
      description: "The latest website records across every workspace.",
      columns: ["Website", "URL", "Workspace", "State", "Added"],
      rows: visibleWebsites.map((website) => ({
        id: asId(website._id),
        values: [
          website.name?.trim() || "Unnamed website",
          website.url,
          workspaceNames.get(asId(website.workspaceId)) ?? "Unknown workspace",
          website.isActive ? "Active" : "Archived",
          asDate(website.createdAt),
        ],
      })),
      emptyMessage: "No websites are stored yet.",
      pagination: paginated(websites.length),
    };
  }

  if (section === "audits" || section === "failed-audits") {
    const filter =
      section === "failed-audits" ? { status: AuditStatus.FAILED } : {};
    const audits = await AuditModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        websiteId: 1,
        workspaceId: 1,
        status: 1,
        overallScore: 1,
        pagesCrawled: 1,
        failureCode: 1,
        createdAt: 1,
      })
      .lean();
    const visibleAudits = audits.slice(0, ADMIN_PAGE_SIZE);
    const [websiteNames, workspaceNames] = await Promise.all([
      namesById(
        visibleAudits.map((entry) => entry.websiteId),
        WebsiteModel,
        "url",
      ),
      namesById(
        visibleAudits.map((entry) => entry.workspaceId),
        WorkspaceModel,
        "name",
      ),
    ]);
    return {
      title: section === "failed-audits" ? "Failed audits" : "Audits",
      description:
        section === "failed-audits"
          ? "Failed audit records with their safe failure code when available."
          : "The latest audit records across every workspace.",
      columns:
        section === "failed-audits"
          ? ["Website", "Workspace", "Failure code", "Pages", "Created"]
          : ["Website", "Workspace", "Status", "Score", "Pages", "Created"],
      rows: visibleAudits.map((audit) => ({
        id: asId(audit._id),
        values:
          section === "failed-audits"
            ? [
                websiteNames.get(asId(audit.websiteId)) ?? "Unknown website",
                workspaceNames.get(asId(audit.workspaceId)) ??
                  "Unknown workspace",
                safeText(audit.failureCode) ?? "Not recorded",
                audit.pagesCrawled,
                asDate(audit.createdAt),
              ]
            : [
                websiteNames.get(asId(audit.websiteId)) ?? "Unknown website",
                workspaceNames.get(asId(audit.workspaceId)) ??
                  "Unknown workspace",
                audit.status,
                audit.overallScore ?? null,
                audit.pagesCrawled,
                asDate(audit.createdAt),
              ],
      })),
      emptyMessage:
        section === "failed-audits"
          ? "No failed audits are stored."
          : "No audits are stored yet.",
      pagination: paginated(audits.length),
    };
  }

  if (section === "queue") {
    const activeStatuses = [
      AuditStatus.QUEUED,
      AuditStatus.INITIALIZING,
      AuditStatus.CRAWLING,
      AuditStatus.ANALYZING,
      AuditStatus.SCORING,
      AuditStatus.GENERATING_REPORT,
    ];
    const jobs = await AuditJobModel.find({ status: { $in: activeStatuses } })
      .sort({ priority: -1, runAt: 1, createdAt: 1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        auditId: 1,
        status: 1,
        priority: 1,
        attempts: 1,
        maxAttempts: 1,
        runAt: 1,
        lockedAt: 1,
        finishedAt: 1,
      })
      .lean();
    return {
      title: "Queue",
      description:
        "Waiting and processing audit jobs only. Completed and failed jobs remain in audit history.",
      columns: [
        "Audit",
        "Status",
        "Priority",
        "Attempts",
        "Scheduled",
        "Lease",
        "Finished",
      ],
      rows: jobs.slice(0, ADMIN_PAGE_SIZE).map((job) => ({
        id: asId(job._id),
        values: [
          asId(job.auditId).slice(-8),
          job.status,
          job.priority,
          `${job.attempts}/${job.maxAttempts}`,
          asDate(job.runAt),
          asDate(job.lockedAt),
          asDate(job.finishedAt),
        ],
      })),
      emptyMessage: "No audits are waiting or processing.",
      pagination: paginated(jobs.length),
    };
  }

  if (section === "usage") {
    type UsageRow = {
      _id: Types.ObjectId;
      kind: "Usage" | "Offline credit";
      workspaceId: Types.ObjectId;
      metric: string;
      quantity: number;
      periodEnd: Date;
      createdAt: Date;
    };
    const entries = await UsageRecordModel.aggregate<UsageRow>([
      {
        $project: {
          kind: { $literal: "Usage" },
          workspaceId: 1,
          metric: 1,
          quantity: 1,
          periodEnd: 1,
          createdAt: 1,
        },
      },
      {
        $unionWith: {
          coll: UsageCreditModel.collection.name,
          pipeline: [
            {
              $project: {
                kind: { $literal: "Offline credit" },
                workspaceId: 1,
                metric: 1,
                quantity: 1,
                periodEnd: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: offset },
      { $limit: ADMIN_PAGE_SIZE + 1 },
    ]).exec();
    const visibleEntries = entries.slice(0, ADMIN_PAGE_SIZE);
    const workspaceNames = await namesById(
      visibleEntries.map((entry) => entry.workspaceId),
      WorkspaceModel,
      "name",
    );
    return {
      title: "Usage and offline credits",
      description:
        "Authoritative usage counters and Super Admin billing-period allowances.",
      columns: [
        "Kind",
        "Workspace",
        "Metric",
        "Quantity",
        "Period ends",
        "Recorded",
      ],
      rows: visibleEntries.map((entry) => ({
        id: `${entry.kind}-${asId(entry._id)}`,
        values: [
          entry.kind,
          workspaceNames.get(asId(entry.workspaceId)) ?? "Unknown workspace",
          entry.metric,
          entry.quantity,
          asDate(entry.periodEnd),
          asDate(entry.createdAt),
        ],
      })),
      emptyMessage: "No usage counters or offline credits are stored.",
      pagination: paginated(entries.length),
    };
  }

  if (section === "reports") {
    const reports = await ReportModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        workspaceId: 1,
        title: 1,
        status: 1,
        fileName: 1,
        fileSizeBytes: 1,
        createdAt: 1,
      })
      .lean();
    const visibleReports = reports.slice(0, ADMIN_PAGE_SIZE);
    const workspaceNames = await namesById(
      visibleReports.map((entry) => entry.workspaceId),
      WorkspaceModel,
      "name",
    );
    return {
      title: "Reports",
      description:
        "Generated report metadata; storage URLs and checksums remain private.",
      columns: ["Title", "Workspace", "Status", "File", "Size", "Created"],
      rows: visibleReports.map((report) => ({
        id: asId(report._id),
        values: [
          report.title,
          workspaceNames.get(asId(report.workspaceId)) ?? "Unknown workspace",
          report.status,
          report.fileName ?? "Not stored",
          report.fileSizeBytes ?? null,
          asDate(report.createdAt),
        ],
      })),
      emptyMessage: "No reports are stored yet.",
      pagination: paginated(reports.length),
    };
  }

  if (section === "leads") {
    const leads = await LeadModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({
        name: 1,
        email: 1,
        websiteUrl: 1,
        requestedService: 1,
        auditScore: 1,
        createdAt: 1,
      })
      .lean();
    return {
      title: "Leads",
      description:
        "Private public-audit service requests, visible only to Super Admins.",
      columns: ["Name", "Email", "Website", "Service", "Score", "Captured"],
      rows: leads.slice(0, ADMIN_PAGE_SIZE).map((lead) => ({
        id: asId(lead._id),
        values: [
          lead.name,
          lead.email,
          lead.websiteUrl,
          lead.requestedService,
          lead.auditScore ?? null,
          asDate(lead.createdAt),
        ],
      })),
      emptyMessage: "No leads have been captured.",
      pagination: paginated(leads.length),
    };
  }

  if (section === "system-health") {
    const overview = await getAdminOverview();
    return {
      title: "System health",
      description:
        "Observed database and queue state. Secrets and deployment configuration are never shown.",
      columns: ["Signal", "Observed state", "Detail"],
      rows: [
        {
          id: "database",
          values: [
            "MongoDB connection",
            getDatabaseConnectionState() === 1 ? "Connected" : "Disconnected",
            `Ready state ${getDatabaseConnectionState()}`,
          ],
        },
        {
          id: "worker",
          values: [
            "Worker heartbeat",
            overview.workerHealth,
            overview.workerHealthMessage,
          ],
        },
        {
          id: "queue",
          values: [
            "Queued jobs",
            overview.queueSize,
            "Queue size is derived from authoritative job records.",
          ],
        },
      ],
      emptyMessage: "No health signals are available.",
    };
  }

  if (section === "settings") {
    return {
      title: "System settings",
      description:
        "No mutable system settings are stored in the application database.",
      columns: ["Area", "State", "Notes"],
      rows: [
        {
          id: "secrets",
          values: [
            "Secrets",
            "Deployment managed",
            "Environment secrets are intentionally never exposed here.",
          ],
        },
        {
          id: "entitlements",
          values: [
            "Entitlements",
            "Versioned policy",
            "Plan rules are centralized and not editable through this panel.",
          ],
        },
      ],
      emptyMessage: "No system settings are stored.",
    };
  }

  if (section === "logs") {
    const logs = await ActivityLogModel.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(ADMIN_PAGE_SIZE + 1)
      .select({ action: 1, entityType: 1, entityId: 1, createdAt: 1 })
      .lean();
    return {
      title: "Activity logs",
      description:
        "Recent retained activity metadata. Request addresses and opaque metadata are not rendered.",
      columns: ["Action", "Entity type", "Entity", "Recorded"],
      rows: logs.slice(0, ADMIN_PAGE_SIZE).map((log) => ({
        id: asId(log._id),
        values: [
          log.action,
          log.entityType ?? "Not specified",
          log.entityId ?? "Not specified",
          asDate(log.createdAt),
        ],
      })),
      emptyMessage: "No activity logs are stored yet.",
      pagination: paginated(logs.length),
    };
  }

  return {
    title: "Audit rules",
    description:
      "The deterministic rule catalog is loaded from the audit-rules package.",
    columns: [],
    rows: [],
    emptyMessage: "Rule definitions are provided by the application runtime.",
  };
}
