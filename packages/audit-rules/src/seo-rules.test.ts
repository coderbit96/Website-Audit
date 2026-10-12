import assert from "node:assert/strict";
import test from "node:test";

import { AuditRuleCategory } from "@website-audit/audit-core";

import {
  SEO_RULE_DEFINITIONS,
  SEO_RULE_THRESHOLDS,
  createSeoRuleResult,
  createSeoRuleResults,
} from "./seo-rules.js";

test("defines a complete unique catalog for every current SEO rule", () => {
  assert.equal(SEO_RULE_DEFINITIONS.length, 40);
  assert.equal(
    new Set(SEO_RULE_DEFINITIONS.map((definition) => definition.code)).size,
    SEO_RULE_DEFINITIONS.length,
  );
  for (const definition of SEO_RULE_DEFINITIONS) {
    assert.equal(definition.category, AuditRuleCategory.SEO);
    assert.equal(definition.enabled, true);
    assert.ok(definition.name.length > 0);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.recommendation.length > 0);
    assert.ok(definition.scoreWeight >= 0 && definition.scoreWeight <= 100);
  }
  const codes = new Set(
    SEO_RULE_DEFINITIONS.map((definition) => definition.code),
  );
  for (const requiredCode of [
    "SEO_TITLE_MISSING",
    "SEO_TITLE_TOO_SHORT",
    "SEO_TITLE_TOO_LONG",
    "SEO_DUPLICATE_TITLE",
    "SEO_META_DESCRIPTION_MISSING",
    "SEO_META_DESCRIPTION_TOO_SHORT",
    "SEO_META_DESCRIPTION_TOO_LONG",
    "SEO_DUPLICATE_META_DESCRIPTION",
    "SEO_H1_MISSING",
    "SEO_MULTIPLE_H1",
    "SEO_HEADING_HIERARCHY",
    "SEO_CANONICAL_MISSING",
    "SEO_CANONICAL_CONFLICT",
    "SEO_META_NOINDEX",
    "SEO_HTML_LANG_MISSING",
    "SEO_OG_TITLE_MISSING",
    "SEO_OG_DESCRIPTION_MISSING",
    "SEO_OG_IMAGE_MISSING",
    "SEO_IMAGE_ALT_MISSING",
    "SEO_EMPTY_ALT_REVIEW",
    "SEO_SCHEMA_MISSING",
    "SEO_POOR_INTERNAL_LINKING",
  ]) {
    assert.equal(codes.has(requiredCode), true, `${requiredCode} is required`);
  }
  assert.equal(Object.isFrozen(SEO_RULE_THRESHOLDS), true);
});

test("creates deterministic standardized SEO findings from catalog defaults", () => {
  const match = {
    ruleCode: "SEO_TITLE_MISSING",
    affectedUrl: "https://example.com/",
    evidence: { titleCount: 0 },
  } as const;
  const first = createSeoRuleResult(match);
  const second = createSeoRuleResults([match]);

  assert.deepEqual(second, [first]);
  assert.deepEqual(Object.keys(first).sort(), [
    "affectedUrl",
    "category",
    "description",
    "evidence",
    "recommendation",
    "ruleCode",
    "scoreImpact",
    "severity",
    "title",
  ]);
  assert.equal(first.category, "SEO");
  assert.equal(first.severity, "CRITICAL");
  assert.equal(first.scoreImpact, 10);
});
