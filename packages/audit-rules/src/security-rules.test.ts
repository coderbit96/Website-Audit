import assert from "node:assert/strict";
import test from "node:test";

import { AuditRuleCategory } from "@website-audit/audit-core";

import {
  SECURITY_RULE_DEFINITIONS,
  SECURITY_RULE_THRESHOLDS,
} from "./security-rules.js";

const requiredCodes = [
  "SEC_HTTPS_NOT_USED",
  "SEC_HTTP_TO_HTTPS_MISSING",
  "SEC_HSTS_MISSING",
  "SEC_HSTS_INVALID",
  "SEC_CSP_MISSING",
  "SEC_X_CONTENT_TYPE_OPTIONS_MISSING",
  "SEC_X_CONTENT_TYPE_OPTIONS_INVALID",
  "SEC_FRAME_PROTECTION_MISSING",
  "SEC_X_FRAME_OPTIONS_INVALID",
  "SEC_REFERRER_POLICY_MISSING",
  "SEC_PERMISSIONS_POLICY_MISSING",
  "SEC_MIXED_CONTENT",
  "SEC_SERVER_HEADER_DISCLOSURE",
  "SEC_TECHNOLOGY_DISCLOSURE",
  "SEC_COOKIE_SECURE_MISSING",
  "SEC_COOKIE_SAMESITE_NONE_INSECURE",
] as const;

test("defines the complete unique passive security rule catalog", () => {
  assert.equal(SECURITY_RULE_DEFINITIONS.length, requiredCodes.length);
  assert.deepEqual(
    [...SECURITY_RULE_DEFINITIONS.map((definition) => definition.code)].sort(),
    [...requiredCodes].sort(),
  );
  assert.equal(
    new Set(SECURITY_RULE_DEFINITIONS.map((definition) => definition.code))
      .size,
    SECURITY_RULE_DEFINITIONS.length,
  );
  for (const definition of SECURITY_RULE_DEFINITIONS) {
    assert.equal(definition.category, AuditRuleCategory.SECURITY);
    assert.equal(definition.enabled, true);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.recommendation.length > 0);
    assert.ok(definition.scoreWeight > 0);
  }
  assert.equal(Object.isFrozen(SECURITY_RULE_THRESHOLDS), true);
});
