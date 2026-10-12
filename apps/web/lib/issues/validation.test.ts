import assert from "node:assert/strict";
import test from "node:test";

import {
  issueWorkflowActionSchema,
  parseIssueFilters,
  workflowStatusByAction,
} from "./validation.js";

test("parses supported issue filters and uses the first repeated value", () => {
  const parsed = parseIssueFilters({
    category: ["SEO", "TECHNICAL"],
    severity: "CRITICAL",
    status: "OPEN",
    search: "  canonical  ",
    sort: "NEWEST",
    page: "3",
  });

  assert.equal(parsed.category, "SEO");
  assert.equal(parsed.severity, "CRITICAL");
  assert.equal(parsed.status, "OPEN");
  assert.equal(parsed.search, "canonical");
  assert.equal(parsed.sort, "NEWEST");
  assert.equal(parsed.page, 3);
});

test("rejects an unsafe filter set as a whole and returns safe defaults", () => {
  assert.deepEqual(
    parseIssueFilters({ website: "not-an-id", sort: "random", page: "-1" }),
    { sort: "IMPACT_DESC", page: 1 },
  );
});

test("maps each workflow action to an explicit finding status", () => {
  for (const [action, status] of Object.entries(workflowStatusByAction)) {
    assert.equal(issueWorkflowActionSchema.parse({ action }).action, action);
    assert.match(status, /^(IGNORED|FIXED|REOPENED)$/);
  }
  assert.equal(
    issueWorkflowActionSchema.safeParse({ action: "delete" }).success,
    false,
  );
});
