import assert from "node:assert/strict";
import test from "node:test";

import {
  PageSpeedStrategy,
  PerformanceMetricSource,
  analyzePageSpeedResults,
  type PageSpeedStrategyResult,
} from "./performance.js";

function strategyResult(
  strategy: PageSpeedStrategy,
  score: number,
  overrides: Partial<PageSpeedStrategyResult> = {},
): PageSpeedStrategyResult {
  return {
    strategy,
    analyzedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    performanceScore: score,
    metrics: {
      lcpMs: { value: 2_500, source: PerformanceMetricSource.LAB },
    },
    opportunities: [],
    ...overrides,
  };
}

test("aggregates mobile and desktop scores and stores only measured metrics", () => {
  const report = analyzePageSpeedResults([
    strategyResult(PageSpeedStrategy.MOBILE, 60, {
      metrics: {
        lcpMs: { value: 2_500, source: PerformanceMetricSource.LAB },
        inpMs: { value: 280, source: PerformanceMetricSource.URL_FIELD },
      },
    }),
    strategyResult(PageSpeedStrategy.DESKTOP, 90, { metrics: {} }),
  ]);

  assert.equal(report.measuredScore, 75);
  assert.equal(report.evaluatedStrategyCount, 2);
  const metrics = new Map(report.metrics.map((item) => [item.key, item.value]));
  assert.equal(metrics.get("performance.pagespeed.mobile.score"), 60);
  assert.equal(metrics.get("performance.pagespeed.desktop.score"), 90);
  assert.equal(metrics.get("performance.pagespeed.mobile.inp_ms"), 280);
  assert.equal(metrics.has("performance.pagespeed.desktop.inp_ms"), false);
  assert.equal(
    metrics.get("performance.pagespeed.mobile.inp_ms_source_url_field"),
    1,
  );
});

test("creates deterministic standardized findings from actual opportunities", () => {
  const opportunity = {
    type: "UNUSED_JAVASCRIPT" as const,
    auditId: "unused-javascript",
    title: "Reduce unused JavaScript",
    displayValue: "Potential savings of 120 KiB",
    itemCount: 2,
    savingsBytes: 122_880,
    items: [
      { url: "https://example.com/app.js", wastedBytes: 80_000 },
      { url: "https://example.com/vendor.js", wastedBytes: 42_880 },
    ],
  };
  const input = [
    strategyResult(PageSpeedStrategy.MOBILE, 55, {
      opportunities: [opportunity],
    }),
    strategyResult(PageSpeedStrategy.DESKTOP, 70, {
      opportunities: [opportunity],
    }),
  ];

  const first = analyzePageSpeedResults(input);
  const second = analyzePageSpeedResults([...input].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0]?.ruleCode, "PERF_UNUSED_JAVASCRIPT");
  assert.equal(first.findings[0]?.category, "PERFORMANCE");
  assert.equal(first.findings[0]?.affectedUrl, "https://example.com/");
  assert.equal(first.findings[0]?.occurrences, 4);
  assert.deepEqual(first.findings[0]?.evidence.strategies, [
    "DESKTOP",
    "MOBILE",
  ]);
});

test("leaves performance unevaluated when PageSpeed has no valid result", () => {
  assert.deepEqual(analyzePageSpeedResults([]), {
    findings: [],
    metrics: [],
    measuredScore: null,
    evaluatedStrategyCount: 0,
  });
});
