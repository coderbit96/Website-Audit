import {
  sortAuditRuleResults,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

import {
  PERFORMANCE_RULE_THRESHOLDS,
  createPerformanceRuleResults,
} from "./performance-rules.js";

export const PageSpeedStrategy = {
  MOBILE: "MOBILE",
  DESKTOP: "DESKTOP",
} as const;
export type PageSpeedStrategy =
  (typeof PageSpeedStrategy)[keyof typeof PageSpeedStrategy];

export const PerformanceMetricSource = {
  LAB: "LAB",
  URL_FIELD: "URL_FIELD",
  ORIGIN_FIELD: "ORIGIN_FIELD",
} as const;
export type PerformanceMetricSource =
  (typeof PerformanceMetricSource)[keyof typeof PerformanceMetricSource];

export type PerformanceMetric = {
  value: number;
  source: PerformanceMetricSource;
};

export type PerformanceMetricSet = {
  lcpMs?: PerformanceMetric;
  inpMs?: PerformanceMetric;
  cls?: PerformanceMetric;
  fcpMs?: PerformanceMetric;
  ttfbMs?: PerformanceMetric;
  speedIndexMs?: PerformanceMetric;
  totalBlockingTimeMs?: PerformanceMetric;
};

export type PageSpeedOpportunityType =
  | "RENDER_BLOCKING"
  | "LARGE_IMAGES"
  | "UNUSED_JAVASCRIPT"
  | "UNUSED_CSS"
  | "CACHING"
  | "IMAGE_OPTIMIZATION";

export type PageSpeedOpportunity = {
  type: PageSpeedOpportunityType;
  auditId: string;
  title: string;
  displayValue?: string;
  itemCount: number;
  savingsMs?: number;
  savingsBytes?: number;
  items: readonly Readonly<Record<string, unknown>>[];
};

export type PageSpeedStrategyResult = {
  strategy: PageSpeedStrategy;
  analyzedUrl: string;
  finalUrl: string;
  performanceScore: number;
  metrics: PerformanceMetricSet;
  opportunities: readonly PageSpeedOpportunity[];
};

export type PerformanceAuditMetric = {
  category: "PERFORMANCE";
  key: string;
  value: number;
  unit: string;
};

export type PerformanceSiteReport = {
  findings: AuditRuleResult[];
  metrics: readonly PerformanceAuditMetric[];
  measuredScore: number | null;
  evaluatedStrategyCount: number;
};

const ruleCodeByOpportunity = Object.freeze({
  RENDER_BLOCKING: "PERF_RENDER_BLOCKING_RESOURCES",
  LARGE_IMAGES: "PERF_LARGE_IMAGES",
  UNUSED_JAVASCRIPT: "PERF_UNUSED_JAVASCRIPT",
  UNUSED_CSS: "PERF_UNUSED_CSS",
  CACHING: "PERF_CACHING_OPPORTUNITIES",
  IMAGE_OPTIMIZATION: "PERF_IMAGE_OPTIMIZATION",
}) satisfies Readonly<Record<PageSpeedOpportunityType, string>>;

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function metricKey(strategy: PageSpeedStrategy, key: string): string {
  return `performance.pagespeed.${strategy.toLowerCase()}.${key}`;
}

function addMetric(
  output: PerformanceAuditMetric[],
  strategy: PageSpeedStrategy,
  key: string,
  metric: PerformanceMetric | undefined,
  unit: string,
): void {
  if (!metric || !Number.isFinite(metric.value)) return;
  output.push({
    category: "PERFORMANCE",
    key: metricKey(strategy, key),
    value: round(metric.value, key === "cls" ? 4 : 2),
    unit,
  });
  output.push({
    category: "PERFORMANCE",
    key: metricKey(strategy, `${key}_source_${metric.source.toLowerCase()}`),
    value: 1,
    unit: "boolean",
  });
}

export function analyzePageSpeedResults(
  results: readonly PageSpeedStrategyResult[],
): PerformanceSiteReport {
  const ordered = [...results].sort((left, right) =>
    left.strategy.localeCompare(right.strategy),
  );
  const metrics: PerformanceAuditMetric[] = [];
  const matches: AuditRuleMatch[] = [];
  const opportunities = new Map<
    PageSpeedOpportunityType,
    Array<PageSpeedOpportunity & { strategy: PageSpeedStrategy }>
  >();

  for (const result of ordered) {
    metrics.push({
      category: "PERFORMANCE",
      key: metricKey(result.strategy, "available"),
      value: 1,
      unit: "boolean",
    });
    metrics.push({
      category: "PERFORMANCE",
      key: metricKey(result.strategy, "score"),
      value: round(result.performanceScore),
      unit: "score",
    });
    addMetric(metrics, result.strategy, "lcp_ms", result.metrics.lcpMs, "ms");
    addMetric(metrics, result.strategy, "inp_ms", result.metrics.inpMs, "ms");
    addMetric(metrics, result.strategy, "cls", result.metrics.cls, "score");
    addMetric(metrics, result.strategy, "fcp_ms", result.metrics.fcpMs, "ms");
    addMetric(metrics, result.strategy, "ttfb_ms", result.metrics.ttfbMs, "ms");
    addMetric(
      metrics,
      result.strategy,
      "speed_index_ms",
      result.metrics.speedIndexMs,
      "ms",
    );
    addMetric(
      metrics,
      result.strategy,
      "total_blocking_time_ms",
      result.metrics.totalBlockingTimeMs,
      "ms",
    );

    for (const opportunity of result.opportunities) {
      const entries = opportunities.get(opportunity.type) ?? [];
      entries.push({ ...opportunity, strategy: result.strategy });
      opportunities.set(opportunity.type, entries);
    }
  }

  for (const [type, entries] of [...opportunities.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const details = entries
      .flatMap((entry) =>
        entry.items.map((item) => ({
          strategy: entry.strategy,
          auditId: entry.auditId,
          ...item,
        })),
      )
      .slice(0, PERFORMANCE_RULE_THRESHOLDS.maximumEvidenceItems);
    matches.push({
      ruleCode: ruleCodeByOpportunity[type],
      affectedUrl: ordered[0]?.analyzedUrl ?? null,
      occurrences: Math.max(
        1,
        entries.reduce((total, entry) => total + entry.itemCount, 0),
      ),
      evidence: {
        strategies: [...new Set(entries.map((entry) => entry.strategy))].sort(),
        audits: entries.map((entry) => ({
          strategy: entry.strategy,
          auditId: entry.auditId,
          title: entry.title,
          ...(entry.displayValue ? { displayValue: entry.displayValue } : {}),
          itemCount: entry.itemCount,
          ...(entry.savingsMs !== undefined
            ? { savingsMs: entry.savingsMs }
            : {}),
          ...(entry.savingsBytes !== undefined
            ? { savingsBytes: entry.savingsBytes }
            : {}),
        })),
        details,
        evidenceTruncated:
          entries.reduce((total, entry) => total + entry.items.length, 0) >
          details.length,
      },
    });
  }

  const measuredScore =
    ordered.length === 0
      ? null
      : round(
          ordered.reduce(
            (total, result) => total + result.performanceScore,
            0,
          ) / ordered.length,
        );

  return {
    findings: sortAuditRuleResults(createPerformanceRuleResults(matches)),
    metrics,
    measuredScore,
    evaluatedStrategyCount: ordered.length,
  };
}
