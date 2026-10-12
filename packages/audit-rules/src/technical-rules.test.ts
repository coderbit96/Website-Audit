import assert from "node:assert/strict";
import test from "node:test";

import { AuditRuleCategory } from "@website-audit/audit-core";

import {
  TECHNICAL_RULE_DEFINITIONS,
  TECHNICAL_RULE_THRESHOLDS,
} from "./technical-rules.js";

const requiredCodes = [
  "TECH_BROKEN_INTERNAL_LINK",
  "TECH_BROKEN_EXTERNAL_LINK",
  "TECH_REDIRECT",
  "TECH_REDIRECT_CHAIN",
  "TECH_REDIRECT_LOOP",
  "TECH_HTTP_URL",
  "TECH_404",
  "TECH_SERVER_ERROR",
  "TECH_ROBOTS_BLOCKED",
  "TECH_SITEMAP_MISSING",
  "TECH_URL_TOO_DEEP",
  "TECH_CANONICAL_CONFLICT",
  "TECH_MIXED_CONTENT",
  "TECH_SLOW_RESPONSE",
  "TECH_LARGE_PAGE",
  "TECH_INDEXABILITY",
] as const;

test("defines the complete unique technical SEO rule catalog", () => {
  assert.equal(TECHNICAL_RULE_DEFINITIONS.length, requiredCodes.length);
  assert.deepEqual(
    [...TECHNICAL_RULE_DEFINITIONS.map((definition) => definition.code)].sort(),
    [...requiredCodes].sort(),
  );
  assert.equal(
    new Set(TECHNICAL_RULE_DEFINITIONS.map((definition) => definition.code))
      .size,
    TECHNICAL_RULE_DEFINITIONS.length,
  );
  for (const definition of TECHNICAL_RULE_DEFINITIONS) {
    assert.equal(definition.category, AuditRuleCategory.TECHNICAL);
    assert.equal(definition.enabled, true);
    assert.ok(definition.name);
    assert.ok(definition.description);
    assert.ok(definition.recommendation);
    assert.ok(definition.scoreWeight >= 0 && definition.scoreWeight <= 100);
  }
  assert.equal(Object.isFrozen(TECHNICAL_RULE_THRESHOLDS), true);
});
