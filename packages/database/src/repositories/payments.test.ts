import assert from "node:assert/strict";
import test from "node:test";

import { addUtcMonth, isPaidPlanTier } from "./payments.js";

test("paid checkout excludes the free tier", () => {
  assert.equal(isPaidPlanTier("PRO"), true);
  assert.equal(isPaidPlanTier("AGENCY"), true);
  assert.equal(isPaidPlanTier("FREE"), false);
  assert.equal(isPaidPlanTier("unknown"), false);
});

test("one-month periods preserve time and clamp end-of-month dates", () => {
  assert.equal(
    addUtcMonth(new Date("2026-01-31T12:30:00.000Z")).toISOString(),
    "2026-02-28T12:30:00.000Z",
  );
  assert.equal(
    addUtcMonth(new Date("2028-01-31T12:30:00.000Z")).toISOString(),
    "2028-02-29T12:30:00.000Z",
  );
});
