import assert from "node:assert/strict";
import test from "node:test";

import { AUDIT_PRESET_DEFINITIONS } from "@website-audit/audit-core/audit-queue";

import { createAuditSchema } from "./validation.js";

function validRequest(preset: "QUICK" | "STANDARD" | "FULL") {
  return {
    websiteId: "507f1f77bcf86cd799439011",
    preset,
    settings: AUDIT_PRESET_DEFINITIONS[preset].defaults,
  };
}

test("accepts complete server-validated audit settings", () => {
  assert.equal(
    createAuditSchema.safeParse(validRequest("STANDARD")).success,
    true,
  );
  assert.equal(
    createAuditSchema.safeParse({
      ...validRequest("QUICK"),
      websiteId: "invalid",
    }).success,
    false,
  );
});

test("enforces page and depth ceilings for every preset", () => {
  for (const preset of ["QUICK", "STANDARD", "FULL"] as const) {
    const request = validRequest(preset);
    assert.equal(
      createAuditSchema.safeParse({
        ...request,
        settings: {
          ...request.settings,
          maximumPages: AUDIT_PRESET_DEFINITIONS[preset].maximumPagesLimit + 1,
          maximumDepth: AUDIT_PRESET_DEFINITIONS[preset].maximumDepthLimit + 1,
        },
      }).success,
      false,
      preset,
    );
  }
});

test("rejects an unavailable JavaScript rendering request", () => {
  for (const preset of ["QUICK", "STANDARD", "FULL"] as const) {
    const request = validRequest(preset);
    assert.equal(request.settings.javascriptRendering, false);
    assert.equal(
      createAuditSchema.safeParse({
        ...request,
        settings: { ...request.settings, javascriptRendering: true },
      }).success,
      false,
    );
  }
});

test("rejects omitted settings and client-added fields", () => {
  assert.equal(
    createAuditSchema.safeParse({
      websiteId: "507f1f77bcf86cd799439011",
      preset: "QUICK",
    }).success,
    false,
  );
  assert.equal(
    createAuditSchema.safeParse({
      ...validRequest("QUICK"),
      workspaceId: "507f1f77bcf86cd799439012",
    }).success,
    false,
  );
});
