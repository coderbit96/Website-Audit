import assert from "node:assert/strict";
import test from "node:test";

import { createAuditRuleRegistry } from "@website-audit/audit-core";

import { ACCESSIBILITY_RULE_DEFINITIONS } from "./accessibility-rules.js";

test("defines a complete unique standardized accessibility catalog", () => {
  const registry = createAuditRuleRegistry(ACCESSIBILITY_RULE_DEFINITIONS);
  assert.equal(registry.size, 11);
  for (const definition of registry.values()) {
    assert.equal(definition.category, "ACCESSIBILITY");
    assert.equal(definition.enabled, true);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.recommendation.length > 0);
    assert.ok(definition.scoreWeight > 0);
  }
});
