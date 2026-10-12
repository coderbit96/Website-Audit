import { type ClientSession, Types } from "mongoose";
import type { UsageMetric as UsageMetricValue } from "@website-audit/shared";

import { connectToDatabase } from "../connection.js";
import { UsageMetric } from "../enums.js";
import { AuditModel, UsageRecordModel } from "../models.js";
import { getWorkspaceEntitlementContext } from "./entitlements.js";

export type UsagePeriod = Readonly<{
  start: Date;
  end: Date;
}>;

export type UsageReservation = Readonly<{
  workspaceId: string;
  metric: UsageMetricValue;
  period: UsagePeriod;
  quantity: number;
}>;

export type UsageReservationResult =
  | { allowed: true; used: number; reservation: UsageReservation }
  | { allowed: false; used: number; limit: number };

const usageMetricValues = new Set<string>(Object.values(UsageMetric));

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function assertUsageInput(input: {
  workspaceId: string;
  metric: UsageMetricValue;
  period: UsagePeriod;
}): void {
  if (!Types.ObjectId.isValid(input.workspaceId)) {
    throw new Error("The usage workspace identifier is invalid.");
  }
  if (!usageMetricValues.has(input.metric)) {
    throw new Error("The usage metric is invalid.");
  }
  if (
    !Number.isFinite(input.period.start.getTime()) ||
    !Number.isFinite(input.period.end.getTime()) ||
    input.period.start >= input.period.end
  ) {
    throw new Error("The usage period is invalid.");
  }
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

export function createUsageCounterKey(input: {
  workspaceId: string;
  metric: UsageMetricValue;
  periodStart: Date;
}): string {
  return `${input.workspaceId}:${input.metric}:${input.periodStart.toISOString()}`;
}

export function getCurrentUsagePeriod(): UsagePeriod {
  return {
    start: new Date("1970-01-01T00:00:00.000Z"),
    end: new Date("9999-12-31T23:59:59.999Z"),
  };
}

async function ensureUsageCounter(
  input: {
    workspaceId: string;
    metric: UsageMetricValue;
    period: UsagePeriod;
    baselineQuantity: number;
    reconcileAtLeast: boolean;
  },
  session?: ClientSession,
): Promise<string> {
  assertUsageInput(input);
  const baselineQuantity = nonNegativeInteger(
    input.baselineQuantity,
    "Usage baseline",
  );
  const counterKey = createUsageCounterKey({
    workspaceId: input.workspaceId,
    metric: input.metric,
    periodStart: input.period.start,
  });
  const upsertOptions = session ? { upsert: true, session } : { upsert: true };

  try {
    await UsageRecordModel.updateOne(
      { counterKey },
      {
        $setOnInsert: {
          counterKey,
          workspaceId: input.workspaceId,
          metric: input.metric,
          quantity: baselineQuantity,
          periodStart: input.period.start,
          periodEnd: input.period.end,
        },
      },
      upsertOptions,
    ).exec();
  } catch (error) {
    // Concurrent first-use upserts can race before the unique index resolves.
    if (!isDuplicateKeyError(error)) throw error;
  }

  if (input.reconcileAtLeast && baselineQuantity > 0) {
    await UsageRecordModel.updateOne(
      { counterKey, quantity: { $lt: baselineQuantity } },
      {
        $set: {
          quantity: baselineQuantity,
          periodEnd: input.period.end,
        },
      },
      session ? { session } : {},
    ).exec();
  }
  return counterKey;
}

/** Atomically reserves capacity from one workspace usage counter. */
export async function reserveWorkspaceUsage(input: {
  workspaceId: string;
  metric: UsageMetricValue;
  period: UsagePeriod;
  quantity?: number;
  limit: number;
  baselineQuantity: number;
  reconcileAtLeast?: boolean;
}): Promise<UsageReservationResult> {
  await connectToDatabase();
  const quantity = nonNegativeInteger(input.quantity ?? 1, "Usage quantity");
  if (quantity === 0)
    throw new Error("Usage quantity must be greater than zero.");
  const limit = nonNegativeInteger(input.limit, "Usage limit");
  const counterKey = await ensureUsageCounter({
    ...input,
    reconcileAtLeast: input.reconcileAtLeast ?? true,
  });

  const updated = await UsageRecordModel.findOneAndUpdate(
    {
      counterKey,
      quantity: { $lte: Math.max(-1, limit - quantity) },
    },
    {
      $inc: { quantity },
      $set: { periodEnd: input.period.end },
    },
    { returnDocument: "after", runValidators: true },
  )
    .select({ quantity: 1 })
    .lean()
    .exec();

  if (updated) {
    return {
      allowed: true,
      used: updated.quantity,
      reservation: {
        workspaceId: input.workspaceId,
        metric: input.metric,
        period: input.period,
        quantity,
      },
    };
  }

  const current = await UsageRecordModel.findOne({ counterKey })
    .select({ quantity: 1 })
    .lean()
    .exec();
  return { allowed: false, used: current?.quantity ?? 0, limit };
}

/** Releases a prior reservation after its protected write fails or is undone. */
export async function releaseWorkspaceUsage(
  reservation: UsageReservation,
): Promise<boolean> {
  assertUsageInput(reservation);
  const quantity = nonNegativeInteger(reservation.quantity, "Usage quantity");
  if (quantity === 0) return true;
  await connectToDatabase();
  const counterKey = createUsageCounterKey({
    workspaceId: reservation.workspaceId,
    metric: reservation.metric,
    periodStart: reservation.period.start,
  });
  const result = await UsageRecordModel.updateOne(
    { counterKey, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
  ).exec();
  return result.modifiedCount === 1;
}

/** Applies a named decrement once, making retry-driven settlement idempotent. */
export async function releaseWorkspaceUsageOnce(
  reservation: UsageReservation,
  adjustmentKey: string,
): Promise<boolean> {
  assertUsageInput(reservation);
  const quantity = nonNegativeInteger(reservation.quantity, "Usage quantity");
  if (quantity === 0) return true;
  const safeAdjustmentKey = adjustmentKey.trim().slice(0, 200);
  if (!safeAdjustmentKey) throw new Error("Usage adjustment key is required.");
  await connectToDatabase();
  const counterKey = createUsageCounterKey({
    workspaceId: reservation.workspaceId,
    metric: reservation.metric,
    periodStart: reservation.period.start,
  });
  const result = await UsageRecordModel.updateOne(
    {
      counterKey,
      adjustmentKeys: { $ne: safeAdjustmentKey },
      quantity: { $gte: quantity },
    },
    {
      $inc: { quantity: -quantity },
      $addToSet: { adjustmentKeys: safeAdjustmentKey },
    },
  ).exec();
  if (result.modifiedCount === 1) return true;

  return Boolean(
    await UsageRecordModel.exists({
      counterKey,
      adjustmentKeys: safeAdjustmentKey,
    }),
  );
}

/** Monotonically reconciles measured usage such as crawled pages. */
export async function syncWorkspaceUsageAtLeast(input: {
  workspaceId: string;
  metric: UsageMetricValue;
  period: UsagePeriod;
  quantity: number;
}): Promise<void> {
  await connectToDatabase();
  const quantity = nonNegativeInteger(input.quantity, "Usage quantity");
  const counterKey = await ensureUsageCounter(
    {
      ...input,
      baselineQuantity: quantity,
      reconcileAtLeast: true,
    },
    undefined,
  );
  await UsageRecordModel.updateOne(
    { counterKey, quantity: { $lt: quantity } },
    { $set: { quantity, periodEnd: input.period.end } },
  ).exec();
}

function isPublicAuditConfiguration(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "publicAudit" in value &&
    value.publicAudit === true
  );
}

/** Reconciles actual crawled-page usage from authoritative audit records. */
export async function syncAuditPageUsage(
  auditId: string,
  storedPeriod?: UsagePeriod,
): Promise<void> {
  if (!Types.ObjectId.isValid(auditId)) return;
  await connectToDatabase();
  const audit = await AuditModel.findById(auditId)
    .select({ workspaceId: 1, createdAt: 1, configuration: 1 })
    .lean()
    .exec();
  if (!audit || isPublicAuditConfiguration(audit.configuration)) return;

  const workspaceId = audit.workspaceId.toString();
  let period = storedPeriod;
  if (!period) {
    const context = await getWorkspaceEntitlementContext(
      workspaceId,
      audit.createdAt,
    );
    period = {
      start: context.usage.periodStart,
      end: context.usage.periodEnd,
    };
  }
  const totals = await AuditModel.aggregate<{ quantity: number }>([
    {
      $match: {
        workspaceId: audit.workspaceId,
        createdAt: { $gte: period.start, $lt: period.end },
        "configuration.publicAudit": { $ne: true },
      },
    },
    { $group: { _id: null, quantity: { $sum: "$pagesCrawled" } } },
  ]).exec();
  await syncWorkspaceUsageAtLeast({
    workspaceId,
    metric: UsageMetric.PAGES_CRAWLED,
    period,
    quantity: totals[0]?.quantity ?? 0,
  });
}

/** Converts a queued page reservation into the audit's measured page usage. */
export async function settleAuditPageUsage(auditId: string): Promise<void> {
  if (!Types.ObjectId.isValid(auditId)) return;
  await connectToDatabase();
  const audit = await AuditModel.findById(auditId)
    .select({
      workspaceId: 1,
      createdAt: 1,
      pagesCrawled: 1,
      usagePageReservation: 1,
      usagePeriodStart: 1,
      usagePeriodEnd: 1,
      configuration: 1,
    })
    .lean()
    .exec();
  if (!audit || isPublicAuditConfiguration(audit.configuration)) return;

  const workspaceId = audit.workspaceId.toString();
  const hasStoredPeriod =
    audit.usagePeriodStart &&
    audit.usagePeriodEnd &&
    audit.usagePeriodStart < audit.usagePeriodEnd;
  const period = hasStoredPeriod
    ? { start: audit.usagePeriodStart!, end: audit.usagePeriodEnd! }
    : (() => {
        const start = new Date(
          Date.UTC(
            audit.createdAt.getUTCFullYear(),
            audit.createdAt.getUTCMonth(),
            1,
          ),
        );
        return {
          start,
          end: new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
          ),
        };
      })();
  const reserved = Math.max(0, audit.usagePageReservation ?? 0);
  const crawled = Math.max(0, audit.pagesCrawled ?? 0);
  const unused = Math.max(0, reserved - crawled);
  if (unused > 0) {
    const released = await releaseWorkspaceUsageOnce(
      {
        workspaceId,
        metric: UsageMetric.PAGES_CRAWLED,
        period,
        quantity: unused,
      },
      `audit:${auditId}:unused-pages`,
    );
    if (!released) {
      throw new Error("The audit page reservation could not be settled.");
    }
  }
  await AuditModel.updateOne(
    { _id: auditId, pageUsageSettledAt: { $exists: false } },
    { $set: { pageUsageSettledAt: new Date() } },
  ).exec();
  await syncAuditPageUsage(auditId, period);
}
