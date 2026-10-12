import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAuditScores,
  DEFAULT_SCORING_CONFIGURATION,
  prepareScoringFindings,
  SCORING_CATEGORY_WEIGHTS,
  ScoringCategory,
  type ScoringFinding,
} from "./scoring-engine.js";
import {
  AuditRuleCategory,
  materializeAuditRuleResults,
} from "./rule-engine.js";

function finding(overrides: Partial<ScoringFinding> = {}): ScoringFinding {
  return {
    ruleCode: "TEST_RULE",
    category: ScoringCategory.SEO,
    severity: "WARNING",
    ruleWeight: 10,
    affectedPageCount: 10,
    ...overrides,
  };
}

function seoScore(findings: readonly ScoringFinding[], totalPageCount = 10) {
  return calculateAuditScores({
    findings,
    totalPageCount,
    evaluatedCategories: [ScoringCategory.SEO],
  }).categories.SEO;
}

test("uses the centrally configured category weights", () => {
  assert.deepEqual(SCORING_CATEGORY_WEIGHTS, {
    SEO: 0.25,
    TECHNICAL: 0.2,
    PERFORMANCE: 0.2,
    ACCESSIBILITY: 0.15,
    SECURITY: 0.1,
    MOBILE: 0.1,
  });
  assert.equal(
    Object.values(SCORING_CATEGORY_WEIGHTS).reduce(
      (total, weight) => total + weight,
      0,
    ),
    1,
  );
  assert.equal(Object.isFrozen(SCORING_CATEGORY_WEIGHTS), true);
  assert.equal(Object.isFrozen(DEFAULT_SCORING_CONFIGURATION), true);
});

test("critical findings impact more than warnings and recommendations", () => {
  const critical = seoScore([finding({ severity: "CRITICAL" })]);
  const warning = seoScore([finding({ severity: "WARNING" })]);
  const recommendation = seoScore([finding({ severity: "RECOMMENDATION" })]);

  assert.ok(critical.score < warning.score);
  assert.ok(warning.score < recommendation.score);
  assert.equal(critical.deduction, 10);
  assert.equal(warning.deduction, 6);
  assert.equal(recommendation.deduction, 2.5);
});

test("higher rule weights create a larger deduction", () => {
  const low = seoScore([finding({ ruleWeight: 2 })]);
  const high = seoScore([finding({ ruleWeight: 10 })]);

  assert.ok(high.deduction > low.deduction);
  assert.ok(high.score < low.score);
});

test("affected pages and relative site coverage influence impact", () => {
  const onePage = seoScore(
    [finding({ severity: "CRITICAL", affectedPageCount: 1 })],
    100,
  );
  const everyPage = seoScore(
    [finding({ severity: "CRITICAL", affectedPageCount: 100 })],
    100,
  );
  const tenPercentLargeSite = seoScore(
    [finding({ severity: "CRITICAL", affectedPageCount: 10 })],
    100,
  );
  const tenPercentSmallSite = seoScore(
    [finding({ severity: "CRITICAL", affectedPageCount: 1 })],
    10,
  );

  assert.ok(everyPage.deduction > onePage.deduction);
  assert.equal(tenPercentLargeSite.deduction, tenPercentSmallSite.deduction);
});

test("uses category-specific evaluated page counts for bounded engines", () => {
  const result = calculateAuditScores({
    findings: [
      finding({
        category: ScoringCategory.ACCESSIBILITY,
        affectedPageCount: 1,
      }),
    ],
    totalPageCount: 100,
    evaluatedCategories: [ScoringCategory.ACCESSIBILITY],
    evaluatedPageCounts: { ACCESSIBILITY: 2 },
  });

  assert.equal(result.categories.ACCESSIBILITY.ruleImpacts[0]?.coverage, 0.5);
  assert.ok(result.categories.ACCESSIBILITY.deduction > 0);
  assert.throws(
    () =>
      calculateAuditScores({
        findings: [],
        totalPageCount: 10,
        evaluatedCategories: [ScoringCategory.ACCESSIBILITY],
        evaluatedPageCounts: { ACCESSIBILITY: 11 },
      }),
    /evaluated page count/,
  );
});

test("uses validated measured engine scores without fabricating rule impacts", () => {
  const report = calculateAuditScores({
    findings: [
      finding({
        ruleCode: "PERF_OPPORTUNITY",
        category: ScoringCategory.PERFORMANCE,
        affectedPageCount: 1,
      }),
    ],
    totalPageCount: 10,
    evaluatedCategories: [ScoringCategory.PERFORMANCE],
    evaluatedPageCounts: { PERFORMANCE: 1 },
    measuredCategoryScores: { PERFORMANCE: 72.456 },
  });

  assert.equal(report.categories.PERFORMANCE.score, 72.46);
  assert.equal(report.categories.PERFORMANCE.deduction, 27.54);
  assert.equal(report.categories.PERFORMANCE.failingRuleCount, 1);
  assert.deepEqual(report.categories.PERFORMANCE.ruleImpacts, []);
  assert.equal(report.overall.score, 72.46);
  assert.throws(
    () =>
      calculateAuditScores({
        findings: [],
        totalPageCount: 1,
        evaluatedCategories: [],
        measuredCategoryScores: { PERFORMANCE: 80 },
      }),
    /measured score/,
  );
  assert.throws(
    () =>
      calculateAuditScores({
        findings: [],
        totalPageCount: 1,
        evaluatedCategories: [ScoringCategory.PERFORMANCE],
        measuredCategoryScores: { PERFORMANCE: 101 },
      }),
    /measured score/,
  );
});

test("groups repeated instances of one rule and caps its deduction", () => {
  const repeated = Array.from({ length: 1_000 }, (_, index) =>
    finding({
      ruleCode: "LOW_VALUE_REPEAT",
      severity: "RECOMMENDATION",
      ruleWeight: 1,
      affectedPageCount: 1,
      affectedUrls: [`https://example.com/page-${index}`],
    }),
  );
  const score = seoScore(repeated, 1_000);

  assert.equal(score.failingRuleCount, 1);
  assert.equal(score.ruleImpacts[0]?.affectedPageCount, 1_000);
  assert.equal(score.deduction, 0.25);
  assert.equal(score.score, 99.75);
});

test("passed checks confirm coverage and offset a bounded amount of deductions", () => {
  const failure = finding({ severity: "CRITICAL", ruleCode: "FAILED_RULE" });
  const withoutPass = seoScore([failure]);
  const withPass = seoScore([
    failure,
    finding({ severity: "PASSED", ruleCode: "PASSED_RULE" }),
  ]);

  assert.equal(withPass.passedRuleCount, 1);
  assert.equal(withPass.passedCredit, 1);
  assert.equal(withPass.score, withoutPass.score + 1);
  assert.ok(withPass.score <= 100);
});

test("returns every category and excludes unevaluated engines from overall", () => {
  const report = calculateAuditScores({
    findings: [finding({ severity: "CRITICAL" })],
    totalPageCount: 10,
    evaluatedCategories: [ScoringCategory.SEO],
  });

  assert.equal(report.scores.length, 7);
  assert.equal(report.overall.score, report.categories.SEO.score);
  assert.equal(report.overall.evaluatedWeight, 0.25);
  assert.equal(report.categories.PERFORMANCE.evaluated, false);
  assert.equal(report.categories.PERFORMANCE.score, 0);
});

test("applies configured weights to a fully evaluated overall score", () => {
  const report = calculateAuditScores({
    findings: [finding({ severity: "CRITICAL" })],
    totalPageCount: 10,
    evaluatedCategories: Object.values(ScoringCategory),
  });

  assert.equal(report.categories.SEO.score, 90);
  assert.equal(report.categories.TECHNICAL.score, 100);
  assert.equal(report.overall.score, 97.5);
});

test("is deterministic and independent of finding order", () => {
  const findings = [
    finding({ ruleCode: "B", severity: "WARNING" }),
    finding({ ruleCode: "A", severity: "CRITICAL" }),
    finding({ ruleCode: "C", severity: "PASSED" }),
  ];
  const first = seoScore(findings);
  const second = seoScore([...findings].reverse());

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.ruleImpacts.map((impact) => impact.ruleCode),
    ["A", "B"],
  );
});

test("always clamps scores to the inclusive zero-to-one-hundred range", () => {
  const findings = Array.from({ length: 20 }, (_, index) =>
    finding({
      ruleCode: `CRITICAL_${index}`,
      severity: "CRITICAL",
      ruleWeight: 100,
    }),
  );
  const report = calculateAuditScores({
    findings,
    totalPageCount: 10,
    evaluatedCategories: Object.values(ScoringCategory),
  });

  for (const score of report.scores) {
    assert.ok(score.score >= 0 && score.score <= 100);
  }
  assert.equal(report.categories.SEO.score, 0);
});

test("rejects invalid inputs and findings in unevaluated categories", () => {
  assert.throws(
    () =>
      calculateAuditScores({
        findings: [],
        totalPageCount: 0,
        evaluatedCategories: [],
      }),
    /at least one crawled page/,
  );
  assert.throws(
    () =>
      calculateAuditScores({
        findings: [finding()],
        totalPageCount: 10,
        evaluatedCategories: [],
      }),
    /not marked as evaluated/,
  );
  assert.throws(
    () => seoScore([finding({ affectedPageCount: -1 })]),
    /non-negative integer/,
  );
});

test("prepares page coverage from standardized aggregate evidence", () => {
  const definitions = [
    {
      code: "TECH_AGGREGATE",
      name: "Aggregate",
      category: AuditRuleCategory.TECHNICAL,
      defaultSeverity: "WARNING" as const,
      description: "Aggregate technical issue.",
      recommendation: "Correct affected pages.",
      scoreWeight: 8,
      enabled: true,
    },
  ];
  const findings = materializeAuditRuleResults(definitions, [
    {
      ruleCode: "TECH_AGGREGATE",
      affectedUrl: null,
      evidence: {
        affectedUrlCount: 25,
        affectedUrls: ["https://example.com/a", "https://example.com/b"],
      },
    },
  ]);

  assert.deepEqual(
    prepareScoringFindings({
      findings,
      definitions,
      totalPageCount: 100,
    }),
    [
      {
        ruleCode: "TECH_AGGREGATE",
        category: "TECHNICAL",
        severity: "WARNING",
        ruleWeight: 8,
        affectedPageCount: 25,
        affectedUrls: ["https://example.com/a", "https://example.com/b"],
      },
    ],
  );
});
