export const AuditRuleCategory = {
  SEO: "SEO",
  TECHNICAL: "TECHNICAL",
  PERFORMANCE: "PERFORMANCE",
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  MOBILE: "MOBILE",
  CONTENT: "CONTENT",
} as const;
export type AuditRuleCategory =
  (typeof AuditRuleCategory)[keyof typeof AuditRuleCategory];

export const AuditRuleSeverity = {
  CRITICAL: "CRITICAL",
  WARNING: "WARNING",
  RECOMMENDATION: "RECOMMENDATION",
  PASSED: "PASSED",
} as const;
export type AuditRuleSeverity =
  (typeof AuditRuleSeverity)[keyof typeof AuditRuleSeverity];

export type AuditEvidence = Readonly<Record<string, unknown>>;

export type AuditRuleDefinition = {
  code: string;
  name: string;
  category: AuditRuleCategory;
  defaultSeverity: AuditRuleSeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
  enabled: boolean;
};

export type AuditRuleMatch = {
  ruleCode: string;
  affectedUrl: string | null;
  severity?: AuditRuleSeverity;
  title?: string;
  description?: string;
  evidence?: AuditEvidence;
  recommendation?: string;
  affectedElement?: string;
  occurrences?: number;
};

export type AuditRuleResult = {
  ruleCode: string;
  category: AuditRuleCategory;
  severity: AuditRuleSeverity;
  title: string;
  description: string;
  affectedUrl: string | null;
  evidence: AuditEvidence;
  recommendation: string;
  scoreImpact: number;
  affectedElement?: string;
  occurrences?: number;
};

export type AuditRule<Context> = {
  definition: AuditRuleDefinition;
  evaluate: (
    context: Readonly<Context>,
  ) =>
    | Omit<AuditRuleMatch, "ruleCode">
    | readonly Omit<AuditRuleMatch, "ruleCode">[]
    | null;
};

export const AUDIT_SEVERITY_IMPACT_FACTORS = Object.freeze({
  CRITICAL: 1,
  WARNING: 0.6,
  RECOMMENDATION: 0.25,
  PASSED: 0,
}) satisfies Readonly<Record<AuditRuleSeverity, number>>;

function validateDefinition(definition: AuditRuleDefinition): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(definition.code)) {
    throw new Error(`Invalid audit rule code: ${definition.code}`);
  }
  if (
    !Number.isFinite(definition.scoreWeight) ||
    definition.scoreWeight < 0 ||
    definition.scoreWeight > 100
  ) {
    throw new Error(
      `Audit rule ${definition.code} has an invalid score weight.`,
    );
  }
  for (const [field, value] of [
    ["name", definition.name],
    ["description", definition.description],
    ["recommendation", definition.recommendation],
  ] as const) {
    if (!value.trim()) {
      throw new Error(`Audit rule ${definition.code} has an empty ${field}.`);
    }
  }
  if (!Object.values(AuditRuleCategory).includes(definition.category)) {
    throw new Error(`Audit rule ${definition.code} has an invalid category.`);
  }
  if (!Object.values(AuditRuleSeverity).includes(definition.defaultSeverity)) {
    throw new Error(
      `Audit rule ${definition.code} has an invalid default severity.`,
    );
  }
}

export function createAuditRuleRegistry(
  definitions: readonly AuditRuleDefinition[],
): ReadonlyMap<string, AuditRuleDefinition> {
  const registry = new Map<string, AuditRuleDefinition>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (registry.has(definition.code)) {
      throw new Error(`Duplicate audit rule code: ${definition.code}`);
    }
    registry.set(definition.code, Object.freeze({ ...definition }));
  }
  return registry;
}

export function calculateScoreImpact(
  scoreWeight: number,
  severity: AuditRuleSeverity,
): number {
  return (
    Math.round(scoreWeight * AUDIT_SEVERITY_IMPACT_FACTORS[severity] * 100) /
    100
  );
}

export function sortAuditRuleResults(
  results: readonly AuditRuleResult[],
): AuditRuleResult[] {
  return [...results].sort(
    (left, right) =>
      left.ruleCode.localeCompare(right.ruleCode) ||
      (left.affectedUrl ?? "").localeCompare(right.affectedUrl ?? "") ||
      left.title.localeCompare(right.title),
  );
}

export function materializeAuditRuleResults(
  definitions: readonly AuditRuleDefinition[],
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  const registry = createAuditRuleRegistry(definitions);
  const results = matches.flatMap((match): AuditRuleResult[] => {
    const definition = registry.get(match.ruleCode);
    if (!definition) {
      throw new Error(`Unknown audit rule code: ${match.ruleCode}`);
    }
    if (!definition.enabled) return [];
    const severity = match.severity ?? definition.defaultSeverity;
    const common = {
      ruleCode: definition.code,
      category: definition.category,
      severity,
      title: match.title ?? definition.name,
      description: match.description ?? definition.description,
      affectedUrl: match.affectedUrl,
      evidence: Object.freeze({ ...(match.evidence ?? {}) }),
      recommendation: match.recommendation ?? definition.recommendation,
      scoreImpact: calculateScoreImpact(definition.scoreWeight, severity),
    } satisfies AuditRuleResult;
    return [
      {
        ...common,
        ...(match.affectedElement
          ? { affectedElement: match.affectedElement }
          : {}),
        ...(match.occurrences !== undefined
          ? { occurrences: Math.max(1, Math.floor(match.occurrences)) }
          : {}),
      },
    ];
  });
  return sortAuditRuleResults(results);
}

export function runAuditRules<Context>(
  rules: readonly AuditRule<Context>[],
  context: Readonly<Context>,
): AuditRuleResult[] {
  const definitions = rules.map((rule) => rule.definition);
  const matches = [...rules]
    .filter((rule) => rule.definition.enabled)
    .sort((left, right) =>
      left.definition.code.localeCompare(right.definition.code),
    )
    .flatMap((rule): AuditRuleMatch[] => {
      const evaluated = rule.evaluate(context);
      if (evaluated === null) return [];
      const items = Array.isArray(evaluated) ? evaluated : [evaluated];
      return items.map((match) => ({
        ...match,
        ruleCode: rule.definition.code,
      }));
    });
  return materializeAuditRuleResults(definitions, matches);
}
