import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import {
  PlanTier,
  type PlanTier as PlanTierValue,
} from "@website-audit/shared";

import { connectToDatabase } from "../connection.js";
import { SubscriptionStatus, WorkspaceRole } from "../enums.js";
import {
  PaymentOrderModel,
  PlanModel,
  SubscriptionModel,
  WorkspaceMemberModel,
} from "../models.js";

export type PaidPlanTier = typeof PlanTier.PRO | typeof PlanTier.AGENCY;

export class PaymentAccessError extends Error {
  constructor() {
    super("Only a workspace owner or administrator can purchase a plan.");
    this.name = "PaymentAccessError";
  }
}

export class PaidPlanUnavailableError extends Error {
  constructor() {
    super("The selected plan is temporarily unavailable.");
    this.name = "PaidPlanUnavailableError";
  }
}

export function isPaidPlanTier(value: unknown): value is PaidPlanTier {
  return value === PlanTier.PRO || value === PlanTier.AGENCY;
}

/** Preserve the purchase time and clamp month-end dates (for example Jan 31). */
export function addUtcMonths(date: Date, months: number): Date {
  if (!Number.isSafeInteger(months) || months < 0)
    throw new Error("Month count must be a non-negative whole number.");
  const nextMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0),
  ).getUTCDate();
  nextMonth.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  nextMonth.setUTCHours(
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  return nextMonth;
}

export function addUtcMonth(date: Date): Date {
  return addUtcMonths(date, 1);
}

export async function preparePaidPlanPurchase(input: {
  workspaceId: string;
  userId: string;
  planTier: PaidPlanTier;
}): Promise<{ planId: string; receipt: string }> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.userId)
  ) {
    throw new Error("Account identifiers are invalid.");
  }
  await connectToDatabase();
  const membership = await WorkspaceMemberModel.exists({
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: { $in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
  });
  if (!membership) throw new PaymentAccessError();
  const plan = await PlanModel.findOne({
    slug: input.planTier.toLowerCase(),
    isActive: true,
  })
    .select({ _id: 1 })
    .lean();
  if (!plan) throw new PaidPlanUnavailableError();
  return { planId: plan._id.toString(), receipt: `ss_${randomUUID()}` };
}

export async function saveRazorpayOrder(input: {
  workspaceId: string;
  userId: string;
  planId: string;
  planTier: PaidPlanTier;
  amountPaise: number;
  receipt: string;
  providerOrderId: string;
}): Promise<void> {
  await connectToDatabase();
  await PaymentOrderModel.create({
    workspaceId: input.workspaceId,
    userId: input.userId,
    planId: input.planId,
    planTier: input.planTier,
    amountPaise: input.amountPaise,
    currency: "INR",
    receipt: input.receipt,
    providerOrderId: input.providerOrderId,
    status: "CREATED",
  });
}

export async function getWorkspacePaymentOrder(
  workspaceId: string,
  providerOrderId: string,
) {
  await connectToDatabase();
  return PaymentOrderModel.findOne({ workspaceId, providerOrderId })
    .select({
      providerOrderId: 1,
      providerPaymentId: 1,
      amountPaise: 1,
      currency: 1,
      status: 1,
      periodEnd: 1,
    })
    .lean();
}

/** Atomically records a captured payment and its one-month entitlement. */
export async function activateCapturedPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  currency: string;
  now?: Date;
}): Promise<{ periodEnd: Date } | null> {
  const connection = await connectToDatabase();
  const session = await connection.connection.startSession();
  const now = input.now ?? new Date();
  let result: { periodEnd: Date } | null = null;
  try {
    await session.withTransaction(async () => {
      const order = await PaymentOrderModel.findOne({
        providerOrderId: input.providerOrderId,
      }).session(session);
      if (!order) return;
      if (
        order.amountPaise !== input.amountPaise ||
        order.currency !== input.currency
      ) {
        throw new Error("Captured payment does not match the priced order.");
      }
      if (order.status === "CAPTURED") {
        if (
          order.providerPaymentId !== input.providerPaymentId ||
          !order.periodEnd
        ) {
          throw new Error("Payment order was captured with different details.");
        }
        result = { periodEnd: order.periodEnd };
        return;
      }
      const existing = await SubscriptionModel.findOne({
        workspaceId: order.workspaceId,
      }).session(session);
      const existingPlan = existing
        ? await PlanModel.findById(existing.planId).session(session)
        : null;
      const paidExistingTier = existingPlan?.slug?.toUpperCase() as
        PlanTierValue | undefined;
      const carryForward =
        existing?.status === SubscriptionStatus.ACTIVE &&
        existing.currentPeriodEnd &&
        existing.currentPeriodEnd > now &&
        isPaidPlanTier(paidExistingTier)
          ? existing.currentPeriodEnd
          : now;
      const periodEnd = addUtcMonth(carryForward);
      const periodStart =
        carryForward === now ? now : (existing?.currentPeriodStart ?? now);
      await SubscriptionModel.updateOne(
        { workspaceId: order.workspaceId },
        {
          $set: {
            planId: order.planId,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: true,
          },
          $unset: { trialEndsAt: 1, cancelledAt: 1 },
        },
        { session, upsert: true },
      );
      order.status = "CAPTURED";
      order.providerPaymentId = input.providerPaymentId;
      order.capturedAt = now;
      order.periodStart = carryForward;
      order.periodEnd = periodEnd;
      await order.save({ session });
      result = { periodEnd };
    });
  } finally {
    await session.endSession();
  }
  return result;
}
