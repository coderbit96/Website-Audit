import assert from "node:assert/strict";
import test from "node:test";

import { parseAuditHistoryFilters } from "./history-validation.js";

test("parses bounded audit-history filters", () => {
  assert.deepEqual(
    parseAuditHistoryFilters({
      website: "507f1f77bcf86cd799439011",
      status: "COMPLETED",
      type: "STANDARD",
      from: "2026-01-01",
      to: "2026-02-28",
      page: "3",
    }),
    {
      website: "507f1f77bcf86cd799439011",
      status: "COMPLETED",
      type: "STANDARD",
      from: "2026-01-01",
      to: "2026-02-28",
      page: 3,
    },
  );
});

test("falls back safely for invalid IDs, dates, status, and pages", () => {
  assert.deepEqual(
    parseAuditHistoryFilters({
      website: "not-an-id",
      status: "UNKNOWN",
      from: "2026-12-31",
      to: "2026-01-01",
      page: "0",
    }),
    { page: 1 },
  );
});

test("uses only the first repeated query value", () => {
  assert.deepEqual(
    parseAuditHistoryFilters({
      status: ["FAILED", "COMPLETED"],
      page: ["2", "999"],
    }),
    { status: "FAILED", page: 2 },
  );
});
