import assert from "node:assert/strict";
import test from "node:test";

import { UsageMetric } from "../enums.js";
import { createUsageCounterKey, getCurrentUsagePeriod } from "./usage.js";

test("creates stable counter identities per workspace, metric, and period", () => {
  const periodStart = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(
    createUsageCounterKey({
      workspaceId: "507f1f77bcf86cd799439011",
      metric: UsageMetric.AUDITS,
      periodStart,
    }),
    "507f1f77bcf86cd799439011:AUDITS:2026-10-01T00:00:00.000Z",
  );
});

test("uses one stable non-billing period for current resource gauges", () => {
  const period = getCurrentUsagePeriod();
  assert.equal(period.start.toISOString(), "1970-01-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "9999-12-31T23:59:59.999Z");
  assert.ok(period.start < period.end);
});
