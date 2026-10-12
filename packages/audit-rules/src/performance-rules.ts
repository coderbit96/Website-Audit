import {
  AuditRuleCategory,
  AuditRuleSeverity,
  materializeAuditRuleResults,
  type AuditRuleDefinition,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

type PerformanceSeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const PERFORMANCE_RULE_THRESHOLDS = Object.freeze({
  largeImageBytes: 250_000,
  maximumEvidenceItems: 25,
  maximumEvidenceStringLength: 500,
});

function definePerformanceRule(input: {
  code: string;
  name: string;
  defaultSeverity: PerformanceSeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.PERFORMANCE,
    enabled: true,
  });
}

export const PERFORMANCE_RULE_DEFINITIONS = Object.freeze([
  definePerformanceRule({
    code: "PERF_RENDER_BLOCKING_RESOURCES",
    name: "Render-blocking resources",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "PageSpeed identified resources that can delay the initial page render.",
    recommendation:
      "Inline critical resources and defer or asynchronously load non-critical CSS and JavaScript where safe.",
    scoreWeight: 7,
  }),
  definePerformanceRule({
    code: "PERF_LARGE_IMAGES",
    name: "Large image resources",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The analyzed page transferred one or more image resources above the configured size threshold.",
    recommendation:
      "Resize large images for their displayed dimensions and use appropriately compressed modern formats.",
    scoreWeight: 6,
  }),
  definePerformanceRule({
    code: "PERF_UNUSED_JAVASCRIPT",
    name: "Unused JavaScript",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "PageSpeed found JavaScript bytes that were not needed during the measured page load.",
    recommendation:
      "Remove unused code, split bundles, and load scripts only when the related functionality is needed.",
    scoreWeight: 6,
  }),
  definePerformanceRule({
    code: "PERF_UNUSED_CSS",
    name: "Unused CSS",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "PageSpeed found stylesheet bytes that were not used during the measured page load.",
    recommendation:
      "Remove unused rules, split styles by route or component, and keep critical CSS focused.",
    scoreWeight: 4,
  }),
  definePerformanceRule({
    code: "PERF_CACHING_OPPORTUNITIES",
    name: "Caching opportunities",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "PageSpeed identified static resources that could benefit from a longer effective cache lifetime.",
    recommendation:
      "Use versioned asset URLs and appropriate Cache-Control lifetimes for stable static resources.",
    scoreWeight: 4,
  }),
  definePerformanceRule({
    code: "PERF_IMAGE_OPTIMIZATION",
    name: "Image delivery opportunities",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "PageSpeed identified potential savings from improving image delivery.",
    recommendation:
      "Serve correctly sized, efficiently encoded images and adopt modern formats where browser support permits.",
    scoreWeight: 6,
  }),
]);

export function createPerformanceRuleResults(
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  return materializeAuditRuleResults(PERFORMANCE_RULE_DEFINITIONS, matches);
}
