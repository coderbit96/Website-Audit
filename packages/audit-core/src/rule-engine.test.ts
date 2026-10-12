import assert from "node:assert/strict";
import test from "node:test";

import {
  AuditRuleCategory,
  AuditRuleSeverity,
  createAuditRuleRegistry,
  materializeAuditRuleResults,
  runAuditRules,
  type AuditRuleDefinition,
} from "./rule-engine.js";

const definition = {
  code: "SEO_TITLE_MISSING",
  name: "Page title is missing",
  category: AuditRuleCategory.SEO,
  defaultSeverity: AuditRuleSeverity.CRITICAL,
  description: "The page has no title element.",
  recommendation: "Add a descriptive title.",
  scoreWeight: 8,
  enabled: true,
} satisfies AuditRuleDefinition;

test("materializes a complete standardized finding from a rule definition", () => {
  assert.deepEqual(
    materializeAuditRuleResults(
      [definition],
      [
        {
          ruleCode: definition.code,
          affectedUrl: "https://example.com/",
          evidence: { titleCount: 0 },
        },
      ],
    ),
    [
      {
        ruleCode: "SEO_TITLE_MISSING",
        category: "SEO",
        severity: "CRITICAL",
        title: "Page title is missing",
        description: "The page has no title element.",
        affectedUrl: "https://example.com/",
        evidence: { titleCount: 0 },
        recommendation: "Add a descriptive title.",
        scoreImpact: 8,
      },
    ],
  );
});

test("runs rules in deterministic code and URL order", () => {
  const second = {
    ...definition,
    code: "SEO_DESCRIPTION_MISSING",
    name: "Description is missing",
    scoreWeight: 5,
  } satisfies AuditRuleDefinition;
  const results = runAuditRules(
    [
      {
        definition,
        evaluate: () => ({ affectedUrl: "https://example.com/z" }),
      },
      {
        definition: second,
        evaluate: () => [
          { affectedUrl: "https://example.com/b" },
          { affectedUrl: "https://example.com/a" },
        ],
      },
    ],
    {},
  );

  assert.deepEqual(
    results.map((result) => [result.ruleCode, result.affectedUrl]),
    [
      ["SEO_DESCRIPTION_MISSING", "https://example.com/a"],
      ["SEO_DESCRIPTION_MISSING", "https://example.com/b"],
      ["SEO_TITLE_MISSING", "https://example.com/z"],
    ],
  );
});

test("skips disabled rules and rejects unknown or duplicate definitions", () => {
  assert.deepEqual(
    materializeAuditRuleResults(
      [{ ...definition, enabled: false }],
      [{ ruleCode: definition.code, affectedUrl: null }],
    ),
    [],
  );
  assert.throws(
    () =>
      materializeAuditRuleResults(
        [definition],
        [{ ruleCode: "SEO_UNKNOWN", affectedUrl: null }],
      ),
    /Unknown audit rule code/,
  );
  assert.throws(
    () => createAuditRuleRegistry([definition, definition]),
    /Duplicate audit rule code/,
  );
});
