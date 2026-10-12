import assert from "node:assert/strict";
import test from "node:test";

import { FindingSeverity, FindingStatus } from "../enums.js";
import { summarizeDashboardIssueCounts } from "./dashboard-analytics.js";

test("counts only active current critical and warning findings", () => {
  assert.deepEqual(
    summarizeDashboardIssueCounts([
      {
        severity: FindingSeverity.CRITICAL,
        status: FindingStatus.OPEN,
        count: 2,
      },
      {
        severity: FindingSeverity.WARNING,
        status: FindingStatus.REOPENED,
        count: 3,
      },
      {
        severity: FindingSeverity.CRITICAL,
        status: FindingStatus.FIXED,
        count: 4,
      },
    ]),
    { critical: 2, warnings: 3, resolved: 4 },
  );
});

test("does not treat ignored, passed, or invalid aggregate counts as active issues", () => {
  assert.deepEqual(
    summarizeDashboardIssueCounts([
      {
        severity: FindingSeverity.WARNING,
        status: FindingStatus.IGNORED,
        count: 10,
      },
      {
        severity: FindingSeverity.PASSED,
        status: FindingStatus.OPEN,
        count: 8,
      },
      {
        severity: FindingSeverity.CRITICAL,
        status: FindingStatus.OPEN,
        count: Number.NaN,
      },
    ]),
    { critical: 0, warnings: 0, resolved: 0 },
  );
});
