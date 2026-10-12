import assert from "node:assert/strict";
import test from "node:test";

import {
  createPriorityActionPlan,
  PRIORITY_CATEGORY_IMPORTANCE,
  PriorityLevel,
  type PriorityFindingInput,
} from "./priority-action-plan.js";

function finding(
  overrides: Partial<PriorityFindingInput> = {},
): PriorityFindingInput {
  return {
    ruleCode: "SEO_TITLE_MISSING",
    category: "SEO",
    severity: "WARNING",
    title: "Page title is missing",
    recommendation: "Add a descriptive title.",
    affectedUrl: "https://example.com/",
    scoreImpact: 6,
    affectedPageCount: 1,
    evaluatedPageCount: 10,
    ...overrides,
  };
}

test("uses the centrally configured category importance", () => {
  assert.deepEqual(PRIORITY_CATEGORY_IMPORTANCE, {
    SEO: 0.25,
    TECHNICAL: 0.2,
    PERFORMANCE: 0.2,
    ACCESSIBILITY: 0.15,
    SECURITY: 0.1,
    MOBILE: 0.1,
    CONTENT: 0.1,
  });
  assert.equal(Object.isFrozen(PRIORITY_CATEGORY_IMPORTANCE), true);
});

test("places critical and warning findings in the expected groups", () => {
  const plan = createPriorityActionPlan([
    finding({
      ruleCode: "SEO_META_NOINDEX",
      severity: "CRITICAL",
      title: "Page is noindexed",
    }),
    finding({ ruleCode: "SEO_TITLE_TOO_LONG" }),
  ]);

  assert.equal(plan.groups[0]?.items[0]?.priority, PriorityLevel.CRITICAL);
  assert.equal(
    plan.groups[0]?.items[0]?.title,
    "Review and remove accidental noindex directives",
  );
  assert.equal(plan.groups[1]?.items[0]?.priority, PriorityLevel.HIGH_IMPACT);
});

test("promotes only broad high-impact recommendations", () => {
  const plan = createPriorityActionPlan([
    finding({
      ruleCode: "PERF_LARGE_IMAGES",
      category: "PERFORMANCE",
      severity: "RECOMMENDATION",
      scoreImpact: 25,
      affectedPageCount: 100,
      evaluatedPageCount: 100,
    }),
    finding({
      ruleCode: "SEO_SCHEMA_MISSING",
      severity: "RECOMMENDATION",
      scoreImpact: 2,
      affectedPageCount: 1,
      evaluatedPageCount: 100,
    }),
  ]);

  assert.equal(plan.items[0]?.ruleCode, "PERF_LARGE_IMAGES");
  assert.equal(plan.items[0]?.priority, PriorityLevel.HIGH_IMPACT);
  assert.equal(plan.items[1]?.priority, PriorityLevel.IMPROVEMENT);
});

test("consolidates repeated rules and calculates distinct page coverage", () => {
  const plan = createPriorityActionPlan([
    finding({ affectedUrl: "https://example.com/a" }),
    finding({ affectedUrl: "https://example.com/b" }),
    finding({ affectedUrl: "https://example.com/a" }),
  ]);
  const item = plan.items[0];

  assert.equal(plan.totalCandidateRules, 1);
  assert.equal(item?.affectedPageCount, 2);
  assert.equal(item?.evaluatedPageCount, 10);
  assert.equal(item?.affectedPagePercentage, 20);
  assert.deepEqual(item?.affectedUrls, [
    "https://example.com/a",
    "https://example.com/b",
  ]);
});

test("uses impact, coverage, and category weight as deterministic tie breakers", () => {
  const plan = createPriorityActionPlan([
    finding({
      ruleCode: "SEC_HEADER_MISSING",
      category: "SECURITY",
      scoreImpact: 5,
      affectedPageCount: 2,
    }),
    finding({
      ruleCode: "TECH_REDIRECT",
      category: "TECHNICAL",
      scoreImpact: 5,
      affectedPageCount: 8,
    }),
    finding({
      ruleCode: "SEO_TITLE_TOO_SHORT",
      category: "SEO",
      scoreImpact: 8,
      affectedPageCount: 8,
    }),
  ]);

  assert.deepEqual(
    plan.items.map((item) => item.ruleCode),
    ["SEO_TITLE_TOO_SHORT", "TECH_REDIRECT", "SEC_HEADER_MISSING"],
  );
});

test("excludes passed checks and enforces the bounded plan size", () => {
  const plan = createPriorityActionPlan(
    [
      finding({ ruleCode: "SEO_PASSED", severity: "PASSED" }),
      finding({ ruleCode: "SEO_ONE" }),
      finding({ ruleCode: "SEO_TWO" }),
    ],
    { maximumItems: 1 },
  );

  assert.equal(plan.totalCandidateRules, 2);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.omittedRuleCount, 1);
});

test("returns the same plan regardless of finding input order", () => {
  const inputs = [
    finding({ ruleCode: "SEO_B", affectedUrl: "https://example.com/b" }),
    finding({ ruleCode: "SEO_A", affectedUrl: "https://example.com/a" }),
  ];

  assert.deepEqual(
    createPriorityActionPlan(inputs),
    createPriorityActionPlan([...inputs].reverse()),
  );
});
