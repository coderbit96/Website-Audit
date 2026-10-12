import {
  AUDIT_SEVERITY_IMPACT_FACTORS,
  AuditRuleSeverity,
  createAuditRuleRegistry,
  type AuditRuleDefinition,
  type AuditRuleResult,
  type AuditRuleSeverity as AuditRuleSeverityValue,
} from "./rule-engine.js";

export const ScoringCategory = {
  SEO: "SEO",
  TECHNICAL: "TECHNICAL",
  PERFORMANCE: "PERFORMANCE",
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  MOBILE: "MOBILE",
} as const;
export type ScoringCategory =
  (typeof ScoringCategory)[keyof typeof ScoringCategory];

export const ScoreCategory = {
  OVERALL: "OVERALL",
  ...ScoringCategory,
} as const;
export type ScoreCategory = (typeof ScoreCategory)[keyof typeof ScoreCategory];

export type ScoringConfiguration = {
  categoryWeights: Readonly<Record<ScoringCategory, number>>;
  coverageFloor: number;
  passedCreditFactor: number;
  maximumPassedCredit: number;
  maximumDeductionPerRule: number;
};

export const SCORING_CATEGORY_WEIGHTS = Object.freeze({
  SEO: 0.25,
  TECHNICAL: 0.2,
  PERFORMANCE: 0.2,
  ACCESSIBILITY: 0.15,
  SECURITY: 0.1,
  MOBILE: 0.1,
}) satisfies Readonly<Record<ScoringCategory, number>>;

export const DEFAULT_SCORING_CONFIGURATION: ScoringConfiguration =
  Object.freeze({
    categoryWeights: SCORING_CATEGORY_WEIGHTS,
    coverageFloor: 0.35,
    passedCreditFactor: 0.1,
    maximumPassedCredit: 5,
    maximumDeductionPerRule: 25,
  });

export type ScoringFinding = {
  ruleCode: string;
  category: ScoringCategory;
  severity: AuditRuleSeverityValue;
  ruleWeight: number;
  affectedPageCount: number;
  affectedUrls?: readonly string[];
};

export type RuleScoreImpact = {
  ruleCode: string;
  severity: AuditRuleSeverityValue;
  ruleWeight: number;
  affectedPageCount: number;
  coverage: number;
  impact: number;
};

export type CategoryScoreResult = {
  category: ScoringCategory;
  score: number;
  evaluated: boolean;
  weight: number;
  deduction: number;
  passedCredit: number;
  failingRuleCount: number;
  passedRuleCount: number;
  ruleImpacts: readonly RuleScoreImpact[];
};

export type OverallScoreResult = {
  category: "OVERALL";
  score: number;
  evaluated: boolean;
  weight: 1;
  evaluatedWeight: number;
  deduction: number;
  passedCredit: number;
  failingRuleCount: number;
  passedRuleCount: number;
};

export type AuditScoreReport = {
  overall: OverallScoreResult;
  categories: Readonly<Record<ScoringCategory, CategoryScoreResult>>;
  scores: readonly (OverallScoreResult | CategoryScoreResult)[];
};

type RuleGroup = {
  ruleCode: string;
  severity: AuditRuleSeverityValue;
  ruleWeight: number;
  maximumReportedPages: number;
  affectedUrls: Set<string>;
};

const scoringCategories = Object.freeze(Object.values(ScoringCategory));

function isScoringCategory(value: string): value is ScoringCategory {
  return (scoringCategories as readonly string[]).includes(value);
}

function round(value: number, decimalPlaces = 2): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFiniteRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

function validateConfiguration(configuration: ScoringConfiguration): void {
  let totalWeight = 0;
  for (const category of scoringCategories) {
    const weight = configuration.categoryWeights[category];
    assertFiniteRange(`${category} scoring weight`, weight, 0, 1);
    totalWeight += weight;
  }
  if (Math.abs(totalWeight - 1) > 0.000_001) {
    throw new Error("Scoring category weights must total 1.");
  }
  assertFiniteRange(
    "Scoring coverage floor",
    configuration.coverageFloor,
    0,
    1,
  );
  assertFiniteRange(
    "Passed credit factor",
    configuration.passedCreditFactor,
    0,
    1,
  );
  assertFiniteRange(
    "Maximum passed credit",
    configuration.maximumPassedCredit,
    0,
    100,
  );
  assertFiniteRange(
    "Maximum rule deduction",
    configuration.maximumDeductionPerRule,
    0,
    100,
  );
}

function validateFinding(finding: ScoringFinding): void {
  if (!finding.ruleCode.trim())
    throw new Error("Scoring rule code is required.");
  if (!scoringCategories.includes(finding.category)) {
    throw new Error(`Unsupported scoring category: ${finding.category}.`);
  }
  if (!Object.values(AuditRuleSeverity).includes(finding.severity)) {
    throw new Error(`Unsupported scoring severity: ${finding.severity}.`);
  }
  assertFiniteRange(
    `${finding.ruleCode} rule weight`,
    finding.ruleWeight,
    0,
    100,
  );
  if (
    !Number.isInteger(finding.affectedPageCount) ||
    finding.affectedPageCount < 0
  ) {
    throw new Error(
      `${finding.ruleCode} affected page count must be a non-negative integer.`,
    );
  }
}

/** Converts standardized findings and their rule catalog into scoring input. */
export function prepareScoringFindings(input: {
  findings: readonly AuditRuleResult[];
  definitions: readonly AuditRuleDefinition[];
  totalPageCount: number;
}): ScoringFinding[] {
  if (!Number.isInteger(input.totalPageCount) || input.totalPageCount < 1) {
    throw new Error("Scoring requires at least one crawled page.");
  }
  const definitions = createAuditRuleRegistry(input.definitions);
  return input.findings.flatMap((finding): ScoringFinding[] => {
    const definition = definitions.get(finding.ruleCode);
    if (!definition) {
      throw new Error(`Missing scoring definition for ${finding.ruleCode}.`);
    }
    if (definition.category !== finding.category) {
      throw new Error(
        `Finding ${finding.ruleCode} does not match its rule category.`,
      );
    }
    if (!isScoringCategory(finding.category)) return [];

    const evidenceUrls = Array.isArray(finding.evidence.affectedUrls)
      ? finding.evidence.affectedUrls.filter(
          (value): value is string => typeof value === "string" && !!value,
        )
      : [];
    const affectedUrls = [
      ...new Set([
        ...(finding.affectedUrl ? [finding.affectedUrl] : []),
        ...evidenceUrls,
      ]),
    ];
    const evidenceCount = finding.evidence.affectedUrlCount;
    const reportedCount =
      typeof evidenceCount === "number" &&
      Number.isFinite(evidenceCount) &&
      evidenceCount >= 0
        ? Math.floor(evidenceCount)
        : null;
    const affectedPageCount = Math.min(
      input.totalPageCount,
      Math.max(
        affectedUrls.length,
        reportedCount ??
          (finding.affectedUrl === null ? input.totalPageCount : 1),
      ),
    );

    return [
      {
        ruleCode: finding.ruleCode,
        category: finding.category,
        severity: finding.severity,
        ruleWeight: definition.scoreWeight,
        affectedPageCount,
        affectedUrls,
      },
    ];
  });
}

function severityRank(severity: AuditRuleSeverityValue): number {
  return AUDIT_SEVERITY_IMPACT_FACTORS[severity];
}

function addToGroup(
  groups: Map<string, RuleGroup>,
  finding: ScoringFinding,
): void {
  const existing = groups.get(finding.ruleCode);
  if (!existing) {
    groups.set(finding.ruleCode, {
      ruleCode: finding.ruleCode,
      severity: finding.severity,
      ruleWeight: finding.ruleWeight,
      maximumReportedPages: finding.affectedPageCount,
      affectedUrls: new Set(finding.affectedUrls ?? []),
    });
    return;
  }
  existing.ruleWeight = Math.max(existing.ruleWeight, finding.ruleWeight);
  existing.maximumReportedPages = Math.max(
    existing.maximumReportedPages,
    finding.affectedPageCount,
  );
  if (severityRank(finding.severity) > severityRank(existing.severity)) {
    existing.severity = finding.severity;
  }
  for (const url of finding.affectedUrls ?? []) existing.affectedUrls.add(url);
}

function coverageFor(
  group: RuleGroup,
  totalPageCount: number,
): {
  affectedPageCount: number;
  coverage: number;
} {
  const affectedPageCount = Math.min(
    totalPageCount,
    Math.max(group.maximumReportedPages, group.affectedUrls.size),
  );
  return {
    affectedPageCount,
    coverage: affectedPageCount / totalPageCount,
  };
}

function coverageMultiplier(
  coverage: number,
  configuration: ScoringConfiguration,
): number {
  return (
    configuration.coverageFloor +
    (1 - configuration.coverageFloor) * Math.sqrt(clamp(coverage, 0, 1))
  );
}

function scoreCategory(input: {
  category: ScoringCategory;
  findings: readonly ScoringFinding[];
  totalPageCount: number;
  evaluated: boolean;
  configuration: ScoringConfiguration;
}): CategoryScoreResult {
  const weight = input.configuration.categoryWeights[input.category];
  if (!input.evaluated) {
    return {
      category: input.category,
      score: 0,
      evaluated: false,
      weight,
      deduction: 0,
      passedCredit: 0,
      failingRuleCount: 0,
      passedRuleCount: 0,
      ruleImpacts: [],
    };
  }

  const failingGroups = new Map<string, RuleGroup>();
  const passedGroups = new Map<string, RuleGroup>();
  for (const finding of input.findings) {
    addToGroup(
      finding.severity === AuditRuleSeverity.PASSED
        ? passedGroups
        : failingGroups,
      finding,
    );
  }

  const ruleImpacts = [...failingGroups.values()]
    .sort((left, right) => left.ruleCode.localeCompare(right.ruleCode))
    .map((group): RuleScoreImpact => {
      const { affectedPageCount, coverage } = coverageFor(
        group,
        input.totalPageCount,
      );
      const impact = Math.min(
        input.configuration.maximumDeductionPerRule,
        group.ruleWeight *
          severityRank(group.severity) *
          coverageMultiplier(coverage, input.configuration),
      );
      return {
        ruleCode: group.ruleCode,
        severity: group.severity,
        ruleWeight: group.ruleWeight,
        affectedPageCount,
        coverage: round(coverage, 4),
        impact: round(impact),
      };
    });
  const deduction = round(
    ruleImpacts.reduce((total, impact) => total + impact.impact, 0),
  );
  const rawPassedCredit = [...passedGroups.values()].reduce((total, group) => {
    const { coverage } = coverageFor(group, input.totalPageCount);
    return (
      total +
      group.ruleWeight *
        input.configuration.passedCreditFactor *
        coverageMultiplier(coverage, input.configuration)
    );
  }, 0);
  const passedCredit = round(
    Math.min(
      input.configuration.maximumPassedCredit,
      rawPassedCredit,
      deduction,
    ),
  );
  const score = round(clamp(100 - deduction + passedCredit, 0, 100));

  return {
    category: input.category,
    score,
    evaluated: true,
    weight,
    deduction,
    passedCredit,
    failingRuleCount: failingGroups.size,
    passedRuleCount: passedGroups.size,
    ruleImpacts,
  };
}

export function calculateAuditScores(
  input: {
    findings: readonly ScoringFinding[];
    totalPageCount: number;
    evaluatedCategories: readonly ScoringCategory[];
    evaluatedPageCounts?: Partial<Record<ScoringCategory, number>>;
    measuredCategoryScores?: Partial<Record<ScoringCategory, number>>;
  },
  configuration: ScoringConfiguration = DEFAULT_SCORING_CONFIGURATION,
): AuditScoreReport {
  validateConfiguration(configuration);
  if (!Number.isInteger(input.totalPageCount) || input.totalPageCount < 1) {
    throw new Error("Scoring requires at least one crawled page.");
  }
  for (const finding of input.findings) validateFinding(finding);
  const evaluatedCategories = new Set(input.evaluatedCategories);
  for (const category of evaluatedCategories) {
    if (!scoringCategories.includes(category)) {
      throw new Error(`Unsupported evaluated scoring category: ${category}.`);
    }
  }
  for (const [category, pageCount] of Object.entries(
    input.evaluatedPageCounts ?? {},
  )) {
    if (
      !scoringCategories.includes(category as ScoringCategory) ||
      !Number.isInteger(pageCount) ||
      pageCount < 1 ||
      pageCount > input.totalPageCount
    ) {
      throw new Error(
        `${category} evaluated page count must be between 1 and the total page count.`,
      );
    }
  }
  for (const [category, score] of Object.entries(
    input.measuredCategoryScores ?? {},
  )) {
    if (
      !scoringCategories.includes(category as ScoringCategory) ||
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      !evaluatedCategories.has(category as ScoringCategory)
    ) {
      throw new Error(
        `${category} measured score must be between 0 and 100 and its category must be evaluated.`,
      );
    }
  }

  const categoryEntries = scoringCategories.map((category) => {
    const categoryFindings = input.findings.filter(
      (finding) => finding.category === category,
    );
    if (categoryFindings.length > 0 && !evaluatedCategories.has(category)) {
      throw new Error(
        `Category ${category} has findings but was not marked as evaluated.`,
      );
    }
    const calculated = scoreCategory({
      category,
      findings: categoryFindings,
      totalPageCount:
        input.evaluatedPageCounts?.[category] ?? input.totalPageCount,
      evaluated: evaluatedCategories.has(category),
      configuration,
    });
    const measuredScore = input.measuredCategoryScores?.[category];
    return [
      category,
      measuredScore === undefined
        ? calculated
        : {
            ...calculated,
            score: round(measuredScore),
            deduction: round(100 - measuredScore),
            passedCredit: 0,
            ruleImpacts: [],
          },
    ] as const;
  });
  const categories = Object.fromEntries(categoryEntries) as Record<
    ScoringCategory,
    CategoryScoreResult
  >;
  const evaluated = categoryEntries
    .map(([, score]) => score)
    .filter((score) => score.evaluated);
  const evaluatedWeight = evaluated.reduce(
    (total, score) => total + score.weight,
    0,
  );
  const overallScore =
    evaluatedWeight === 0
      ? 0
      : round(
          evaluated.reduce(
            (total, score) => total + score.score * score.weight,
            0,
          ) / evaluatedWeight,
        );
  const overall: OverallScoreResult = {
    category: ScoreCategory.OVERALL,
    score: overallScore,
    evaluated: evaluated.length > 0,
    weight: 1,
    evaluatedWeight: round(evaluatedWeight),
    deduction: round(100 - overallScore),
    passedCredit: round(
      evaluated.reduce((total, score) => total + score.passedCredit, 0),
    ),
    failingRuleCount: evaluated.reduce(
      (total, score) => total + score.failingRuleCount,
      0,
    ),
    passedRuleCount: evaluated.reduce(
      (total, score) => total + score.passedRuleCount,
      0,
    ),
  };

  return {
    overall,
    categories,
    scores: [overall, ...categoryEntries.map(([, score]) => score)],
  };
}
