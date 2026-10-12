import assert from "node:assert/strict";
import test from "node:test";

import { resolveRateLimitRules } from "./policies.js";

const digest = "a".repeat(64);

test("uses layered identity rules for authenticated audit creation", () => {
  const rules = resolveRateLimitRules("AUDIT_CREATION", {
    clientKey: digest,
    accountKey: digest,
    workspaceKey: digest,
  });

  assert.deepEqual(
    rules.map((rule) => rule.scope),
    [
      "AUDIT_CREATE_CLIENT_HOUR",
      "AUDIT_CREATE_ACCOUNT_HOUR",
      "AUDIT_CREATE_WORKSPACE_HOUR",
    ],
  );
});

test("limits anonymous authentication actions without a raw identifier", () => {
  const rules = resolveRateLimitRules("LOGIN", {
    globalKey: digest,
    clientKey: digest,
  });
  assert.deepEqual(
    rules.map((rule) => rule.scope),
    ["LOGIN_GLOBAL_MINUTE", "LOGIN_CLIENT_MINUTE"],
  );
  assert.equal(rules[0]?.keyHash, digest);
});

test("places a shared ceiling before identity-specific anonymous limits", () => {
  for (const action of ["REGISTRATION", "PASSWORD_RESET"] as const) {
    const rules = resolveRateLimitRules(action, {
      globalKey: digest,
      clientKey: digest,
      emailKey: digest,
    });
    assert.match(rules[0]?.scope ?? "", /_GLOBAL_MINUTE$/);
    assert.equal(rules.length, 3);
  }
});

test("keeps invitation limits ready for the future invitation mutation", () => {
  const rules = resolveRateLimitRules("INVITATION", {
    clientKey: digest,
    accountKey: digest,
    workspaceKey: digest,
  });
  assert.equal(rules.length, 3);
  assert.ok(rules.every((rule) => rule.windowMs > 0 && rule.limit > 0));
});

test("bounds payment confirmation checks by both account and workspace", () => {
  const rules = resolveRateLimitRules("PAYMENT_CONFIRMATION", {
    clientKey: digest,
    accountKey: digest,
    workspaceKey: digest,
  });
  assert.deepEqual(
    rules.map((rule) => rule.scope),
    [
      "PAYMENT_CONFIRMATION_ACCOUNT_MINUTE",
      "PAYMENT_CONFIRMATION_WORKSPACE_MINUTE",
    ],
  );
  assert.ok(rules.every((rule) => rule.limit > 0 && rule.windowMs > 0));
});
