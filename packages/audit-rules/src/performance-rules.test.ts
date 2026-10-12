import assert from "node:assert/strict";
import test from "node:test";

import { AuditRuleCategory } from "@website-audit/audit-core";

import {
  PERFORMANCE_RULE_DEFINITIONS,
  PERFORMANCE_RULE_THRESHOLDS,
} from "./performance-rules.js";

const requiredCodes = [
  "PERF_RENDER_BLOCKING_RESOURCES",
  "PERF_LARGE_IMAGES",
  "PERF_UNUSED_JAVASCRIPT",
  "PERF_UNUSED_CSS",
  "PERF_CACHING_OPPORTUNITIES",
  "PERF_IMAGE_OPTIMIZATION",
] as const;

test("defines the complete unique PageSpeed performance rule catalog", () => {
  assert.deepEqual(
    PERFORMANCE_RULE_DEFINITIONS.map((definition) => definition.code).sort(),
    [...requiredCodes].sort(),
  );
  assert.equal(
    new Set(PERFORMANCE_RULE_DEFINITIONS.map((definition) => definition.code))
      .size,
    requiredCodes.length,
  );
  for (const definition of PERFORMANCE_RULE_DEFINITIONS) {
    assert.equal(definition.category, AuditRuleCategory.PERFORMANCE);
    assert.equal(definition.enabled, true);
    assert.ok(definition.scoreWeight > 0);
    assert.ok(definition.description);
    assert.ok(definition.recommendation);
  }
  assert.equal(Object.isFrozen(PERFORMANCE_RULE_THRESHOLDS), true);
});
