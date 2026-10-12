import assert from "node:assert/strict";
import test from "node:test";

import { AuditRuleCategory } from "@website-audit/audit-core";

import {
  MOBILE_RULE_DEFINITIONS,
  MOBILE_RULE_THRESHOLDS,
  MOBILE_SCORE_COMPONENT_WEIGHTS,
} from "./mobile-rules.js";

const requiredCodes = [
  "MOBILE_VIEWPORT_MISSING",
  "MOBILE_VIEWPORT_INVALID",
  "MOBILE_HORIZONTAL_OVERFLOW",
  "MOBILE_IMAGE_OVERFLOW",
  "MOBILE_TOUCH_TARGET_SIZE",
  "MOBILE_TEXT_READABILITY",
] as const;

test("defines the complete deterministic mobile rule catalog", () => {
  assert.deepEqual(
    MOBILE_RULE_DEFINITIONS.map((definition) => definition.code).sort(),
    [...requiredCodes].sort(),
  );
  assert.equal(
    new Set(MOBILE_RULE_DEFINITIONS.map((definition) => definition.code)).size,
    requiredCodes.length,
  );
  for (const definition of MOBILE_RULE_DEFINITIONS) {
    assert.equal(definition.category, AuditRuleCategory.MOBILE);
    assert.equal(definition.enabled, true);
    assert.ok(definition.description);
    assert.ok(definition.recommendation);
    assert.ok(definition.scoreWeight > 0);
  }
  assert.equal(Object.isFrozen(MOBILE_RULE_THRESHOLDS), true);
  assert.equal(
    MOBILE_SCORE_COMPONENT_WEIGHTS.rules +
      MOBILE_SCORE_COMPONENT_WEIGHTS.pageSpeed,
    1,
  );
});
