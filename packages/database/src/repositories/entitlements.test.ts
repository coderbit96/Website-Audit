import assert from "node:assert/strict";
import test from "node:test";

import { PlanTier } from "@website-audit/shared";

import { SubscriptionStatus } from "../enums.js";
import {
  getCalendarMonthWindow,
  getSubscriptionUsageWindow,
  resolveSubscriptionPlanTier,
} from "./entitlements.js";

const now = new Date("2026-10-09T12:00:00.000Z");

test("resolves only active, unexpired known subscription plans", () => {
  assert.equal(
    resolveSubscriptionPlanTier({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      planSlug: "pro",
      planActive: true,
      currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
      now,
    }),
    PlanTier.PRO,
  );
  assert.equal(
    resolveSubscriptionPlanTier({
      subscriptionStatus: SubscriptionStatus.TRIALING,
      planSlug: "agency",
      planActive: true,
      trialEndsAt: new Date("2026-10-20T00:00:00.000Z"),
      now,
    }),
    PlanTier.AGENCY,
  );
});

test("falls back to FREE for missing, inactive, expired, or unknown state", () => {
  const cases = [
    {
      subscriptionStatus: null,
      planSlug: "pro",
      planActive: true,
    },
    {
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      planSlug: "pro",
      planActive: true,
    },
    {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      planSlug: "pro",
      planActive: false,
    },
    {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      planSlug: "pro",
      planActive: true,
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    },
    {
      subscriptionStatus: SubscriptionStatus.TRIALING,
      planSlug: "agency",
      planActive: true,
      trialEndsAt: new Date("2026-10-08T00:00:00.000Z"),
    },
    {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      planSlug: "unknown-plan",
      planActive: true,
    },
  ] as const;
  for (const candidate of cases) {
    assert.equal(
      resolveSubscriptionPlanTier({ ...candidate, now }),
      PlanTier.FREE,
    );
  }
});

test("uses deterministic UTC calendar-month windows for fallback usage", () => {
  assert.deepEqual(getCalendarMonthWindow(now), {
    start: new Date("2026-10-01T00:00:00.000Z"),
    end: new Date("2026-11-01T00:00:00.000Z"),
  });
});

test("prepaid extensions keep a separate allowance for each purchased month", () => {
  const start = new Date("2026-01-31T12:30:00.000Z");
  const accessEnd = new Date("2026-03-31T12:30:00.000Z");
  assert.deepEqual(
    getSubscriptionUsageWindow(
      start,
      accessEnd,
      new Date("2026-02-15T00:00:00.000Z"),
    ),
    { start, end: new Date("2026-02-28T12:30:00.000Z") },
  );
  assert.deepEqual(
    getSubscriptionUsageWindow(
      start,
      accessEnd,
      new Date("2026-03-01T00:00:00.000Z"),
    ),
    {
      start: new Date("2026-02-28T12:30:00.000Z"),
      end: new Date("2026-03-31T12:30:00.000Z"),
    },
  );
});
