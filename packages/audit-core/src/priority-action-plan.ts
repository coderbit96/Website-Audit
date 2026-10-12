import {
  AuditRuleCategory,
  AuditRuleSeverity,
  type AuditRuleCategory as AuditRuleCategoryValue,
  type AuditRuleSeverity as AuditRuleSeverityValue,
} from "./rule-engine.js";
import { SCORING_CATEGORY_WEIGHTS } from "./scoring-engine.js";

export const PriorityLevel = {
  CRITICAL: 1,
  HIGH_IMPACT: 2,
  IMPROVEMENT: 3,
} as const;
export type PriorityLevel = (typeof PriorityLevel)[keyof typeof PriorityLevel];

export const PRIORITY_CATEGORY_IMPORTANCE = Object.freeze({
  ...SCORING_CATEGORY_WEIGHTS,
  CONTENT: 0.1,
}) satisfies Readonly<Record<AuditRuleCategoryValue, number>>;

export type PriorityFindingInput = {
  ruleCode: string;
  category: AuditRuleCategoryValue;
  severity: AuditRuleSeverityValue;
  title: string;
  recommendation: string;
  affectedUrl: string | null;
  scoreImpact: number;
  affectedPageCount: number;
  evaluatedPageCount: number;
};

export type PriorityActionItem = {
  priority: PriorityLevel;
  ruleCode: string;
  category: AuditRuleCategoryValue;
  severity: Exclude<AuditRuleSeverityValue, "PASSED">;
  title: string;
  recommendation: string;
  priorityScore: number;
  scoreImpact: number;
  affectedPageCount: number;
  evaluatedPageCount: number;
  affectedPagePercentage: number;
  affectedUrls: readonly string[];
  drivers: readonly string[];
};

export type PriorityActionGroup = {
  priority: PriorityLevel;
  label: string;
  description: string;
  items: readonly PriorityActionItem[];
};

export type PriorityActionPlan = {
  groups: readonly PriorityActionGroup[];
  items: readonly PriorityActionItem[];
  totalCandidateRules: number;
  omittedRuleCount: number;
};

export type PriorityActionPlanOptions = {
  maximumItems?: number;
};

type FindingGroup = {
  ruleCode: string;
  categories: Set<AuditRuleCategoryValue>;
  severities: Set<Exclude<AuditRuleSeverityValue, "PASSED">>;
  titles: Set<string>;
  recommendations: Set<string>;
  affectedUrls: Set<string>;
  scoreImpact: number;
  affectedPageCount: number;
  evaluatedPageCount: number;
};

const severityRank = Object.freeze({
  CRITICAL: 3,
  WARNING: 2,
  RECOMMENDATION: 1,
  PASSED: 0,
}) satisfies Readonly<Record<AuditRuleSeverityValue, number>>;

const severityPriorityPoints = Object.freeze({
  CRITICAL: 60,
  WARNING: 35,
  RECOMMENDATION: 15,
}) satisfies Readonly<
  Record<Exclude<AuditRuleSeverityValue, "PASSED">, number>
>;

const priorityMetadata = Object.freeze({
  1: {
    label: "Priority 1 — Critical",
    description: "Resolve confirmed critical risks first.",
  },
  2: {
    label: "Priority 2 — High impact",
    description: "Address material issues with the greatest site-wide impact.",
  },
  3: {
    label: "Priority 3 — Improvements",
    description:
      "Complete evidence-backed improvements after higher priorities.",
  },
}) satisfies Readonly<
  Record<PriorityLevel, { label: string; description: string }>
>;

const actionTitles = Object.freeze({
  SEO_META_NOINDEX: "Review and remove accidental noindex directives",
  TECH_BROKEN_INTERNAL_LINK: "Repair broken internal navigation links",
  SEC_HTTPS_NOT_USED: "Force HTTPS across the website",
  SEC_HTTP_TO_HTTPS_MISSING: "Force HTTPS across the website",
  PERF_LCP_SLOW: "Improve slow Largest Contentful Paint",
  PERF_LARGE_IMAGES: "Compress and correctly size oversized images",
  SEO_TITLE_MISSING: "Add unique, descriptive page titles",
  SEO_IMAGE_ALT_MISSING: "Add meaningful alternative text to images",
  SEO_SCHEMA_MISSING: "Add relevant structured data",
}) satisfies Readonly<Record<string, string>>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function round(value: number, places = 2): number {
  const multiplier = 10 ** places;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function firstAlphabetically(values: ReadonlySet<string>): string {
  return [...values].sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function strongestSeverity(
  severities: ReadonlySet<Exclude<AuditRuleSeverityValue, "PASSED">>,
): Exclude<AuditRuleSeverityValue, "PASSED"> {
  return (
    [...severities].sort(
      (left, right) =>
        severityRank[right] - severityRank[left] || left.localeCompare(right),
    )[0] ?? AuditRuleSeverity.RECOMMENDATION
  );
}

function mostImportantCategory(
  categories: ReadonlySet<AuditRuleCategoryValue>,
): AuditRuleCategoryValue {
  return (
    [...categories].sort(
      (left, right) =>
        PRIORITY_CATEGORY_IMPORTANCE[right] -
          PRIORITY_CATEGORY_IMPORTANCE[left] || left.localeCompare(right),
    )[0] ?? AuditRuleCategory.CONTENT
  );
}

function priorityFor(
  severity: Exclude<AuditRuleSeverityValue, "PASSED">,
  priorityScore: number,
): PriorityLevel {
  if (severity === AuditRuleSeverity.CRITICAL) return PriorityLevel.CRITICAL;
  if (severity === AuditRuleSeverity.WARNING || priorityScore >= 45) {
    return PriorityLevel.HIGH_IMPACT;
  }
  return PriorityLevel.IMPROVEMENT;
}

function buildItem(group: FindingGroup): PriorityActionItem {
  const severity = strongestSeverity(group.severities);
  const category = mostImportantCategory(group.categories);
  const evaluatedPageCount = Math.max(1, Math.floor(group.evaluatedPageCount));
  const affectedPageCount = Math.min(
    evaluatedPageCount,
    Math.max(group.affectedUrls.size, Math.floor(group.affectedPageCount)),
  );
  const affectedPagePercentage = round(
    (affectedPageCount / evaluatedPageCount) * 100,
    1,
  );
  const scoreImpact = round(clamp(group.scoreImpact, 0, 100));
  const severityPoints = severityPriorityPoints[severity];
  const impactPoints = clamp(scoreImpact / 25, 0, 1) * 25;
  const coveragePoints = Math.sqrt(affectedPageCount / evaluatedPageCount) * 15;
  const categoryPoints =
    (PRIORITY_CATEGORY_IMPORTANCE[category] / SCORING_CATEGORY_WEIGHTS.SEO) *
    10;
  const priorityScore = round(
    clamp(
      severityPoints + impactPoints + coveragePoints + categoryPoints,
      0,
      100,
    ),
  );

  return Object.freeze({
    priority: priorityFor(severity, priorityScore),
    ruleCode: group.ruleCode,
    category,
    severity,
    title:
      actionTitles[group.ruleCode as keyof typeof actionTitles] ??
      (firstAlphabetically(group.titles) || group.ruleCode),
    recommendation:
      firstAlphabetically(group.recommendations) ||
      "Review the recorded evidence and correct the underlying issue.",
    priorityScore,
    scoreImpact,
    affectedPageCount,
    evaluatedPageCount,
    affectedPagePercentage,
    affectedUrls: Object.freeze(
      [...group.affectedUrls].sort((left, right) => left.localeCompare(right)),
    ),
    drivers: Object.freeze([
      `${severity.toLowerCase()} severity`,
      `${scoreImpact} score impact`,
      `${affectedPagePercentage}% of evaluated pages`,
      `${category.toLowerCase()} category weight`,
    ]),
  });
}

function boundedMaximum(value: number | undefined): number {
  if (value === undefined) return 24;
  if (!Number.isFinite(value)) return 24;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

/**
 * Produces a stable remediation order from stored audit evidence. Repeated
 * per-page findings are consolidated by rule code before their priority is
 * calculated, preventing noisy rules from dominating the plan.
 */
export function createPriorityActionPlan(
  findings: readonly PriorityFindingInput[],
  options: PriorityActionPlanOptions = {},
): PriorityActionPlan {
  const grouped = new Map<string, FindingGroup>();

  for (const finding of findings) {
    if (finding.severity === AuditRuleSeverity.PASSED) continue;
    const ruleCode = finding.ruleCode.trim().toUpperCase();
    if (!ruleCode) continue;
    const existing = grouped.get(ruleCode) ?? {
      ruleCode,
      categories: new Set<AuditRuleCategoryValue>(),
      severities: new Set<Exclude<AuditRuleSeverityValue, "PASSED">>(),
      titles: new Set<string>(),
      recommendations: new Set<string>(),
      affectedUrls: new Set<string>(),
      scoreImpact: 0,
      affectedPageCount: 0,
      evaluatedPageCount: 1,
    };
    existing.categories.add(finding.category);
    existing.severities.add(finding.severity);
    if (finding.title.trim()) existing.titles.add(finding.title.trim());
    if (finding.recommendation.trim()) {
      existing.recommendations.add(finding.recommendation.trim());
    }
    if (finding.affectedUrl?.trim()) {
      existing.affectedUrls.add(finding.affectedUrl.trim());
    }
    existing.scoreImpact = Math.max(
      existing.scoreImpact,
      finiteNonNegative(finding.scoreImpact),
    );
    existing.affectedPageCount = Math.max(
      existing.affectedPageCount,
      finiteNonNegative(finding.affectedPageCount),
    );
    existing.evaluatedPageCount = Math.max(
      existing.evaluatedPageCount,
      finiteNonNegative(finding.evaluatedPageCount),
    );
    grouped.set(ruleCode, existing);
  }

  const allItems = [...grouped.values()]
    .map(buildItem)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        right.priorityScore - left.priorityScore ||
        PRIORITY_CATEGORY_IMPORTANCE[right.category] -
          PRIORITY_CATEGORY_IMPORTANCE[left.category] ||
        left.ruleCode.localeCompare(right.ruleCode),
    );
  const items = Object.freeze(
    allItems.slice(0, boundedMaximum(options.maximumItems)),
  );
  const groups = Object.freeze(
    ([1, 2, 3] as const).map((priority) =>
      Object.freeze({
        priority,
        ...priorityMetadata[priority],
        items: Object.freeze(
          items.filter((item) => item.priority === priority),
        ),
      }),
    ),
  );

  return Object.freeze({
    groups,
    items,
    totalCandidateRules: allItems.length,
    omittedRuleCount: Math.max(0, allItems.length - items.length),
  });
}
