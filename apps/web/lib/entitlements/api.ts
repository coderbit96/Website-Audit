import "server-only";

import { createNotification, NotificationType } from "@website-audit/database";
import { NextResponse } from "next/server";

import type { CurrentAccount } from "../auth/current-user";
import { PlanEntitlementError } from "./service";
import { webLogger } from "../logging/logger";

export async function planEntitlementResponse(
  error: PlanEntitlementError,
  account?: CurrentAccount,
): Promise<NextResponse> {
  if (account && error.code !== "CLIENT_FEATURE_NOT_AVAILABLE") {
    const periodKey =
      error.periodEnd?.toISOString() ?? new Date().toISOString().slice(0, 10);
    try {
      await createNotification({
        userId: account.id,
        workspaceId: account.workspace.id,
        type: NotificationType.SUBSCRIPTION_LIMIT_REACHED,
        title: "Plan limit reached",
        message: error.message,
        href: "/dashboard/billing",
        dedupeKey: `limit:${error.code}:${error.limit}:${periodKey}`,
        data: { code: error.code, metric: error.metric, limit: error.limit },
      });
    } catch (notificationError) {
      webLogger("error", "notification.subscription_limit_failed", {
        userId: account.id,
        workspaceId: account.workspace.id,
        limitCode: error.code,
        error: notificationError,
      });
    }
  }
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      plan: error.plan,
      metric: error.metric,
      used: error.used,
      limit: error.limit,
      remaining: Math.max(0, error.limit - error.used),
      periodStart: error.periodStart?.toISOString() ?? null,
      periodEnd: error.periodEnd?.toISOString() ?? null,
      resetAt: error.periodEnd?.toISOString() ?? null,
      upgradeRequired: true,
      usage: {
        metric: error.metric,
        used: error.used,
        limit: error.limit,
        remaining: Math.max(0, error.limit - error.used),
        periodStart: error.periodStart?.toISOString() ?? null,
        periodEnd: error.periodEnd?.toISOString() ?? null,
        resetAt: error.periodEnd?.toISOString() ?? null,
      },
    },
    { status: 403 },
  );
}
