import assert from "node:assert/strict";
import test from "node:test";

import { readSafeAuditConfiguration } from "./seo-audit-processor.js";

test("clamps stored crawl settings to authoritative preset limits", () => {
  const configuration = readSafeAuditConfiguration(
    {
      preset: "QUICK",
      maximumPages: 50_000,
      maximumDepth: 99,
      respectRobotsTxt: "false",
      checkExternalLinks: true,
      javascriptRendering: false,
    },
    "FULL",
  );

  assert.equal(configuration.preset, "QUICK");
  assert.equal(configuration.maximumPages, 10);
  assert.equal(configuration.maximumDepth, 2);
  assert.equal(configuration.respectRobotsTxt, true);
  assert.equal(configuration.checkExternalLinks, true);
});

test("uses safe preset defaults for missing legacy configuration", () => {
  const configuration = readSafeAuditConfiguration(null, "FULL_SITE");

  assert.equal(configuration.preset, "STANDARD");
  assert.equal(configuration.maximumPages, 100);
  assert.equal(configuration.maximumDepth, 5);
  assert.equal(configuration.respectRobotsTxt, true);
});

test("does not claim JavaScript rendering for a legacy workspace request", () => {
  const configuration = readSafeAuditConfiguration(
    { preset: "FULL", javascriptRendering: true },
    "FULL",
  );
  assert.equal(configuration.javascriptRendering, false);
});

test("hard-clamps public audit scope independently of stored settings", () => {
  const configuration = readSafeAuditConfiguration(
    {
      publicAudit: true,
      preset: "FULL",
      maximumPages: 500,
      maximumDepth: 10,
      checkExternalLinks: true,
      javascriptRendering: true,
      mobileAnalysis: true,
    },
    "FULL",
  );

  assert.equal(configuration.publicAudit, true);
  assert.equal(configuration.maximumPages, 5);
  assert.equal(configuration.maximumDepth, 1);
  assert.equal(configuration.checkExternalLinks, false);
  assert.equal(configuration.javascriptRendering, false);
  assert.equal(configuration.mobileAnalysis, false);
});

test("hard-clamps workspace crawl scope to the authoritative plan entitlement", () => {
  const configuration = readSafeAuditConfiguration(
    {
      preset: "STANDARD",
      maximumPages: 100,
      entitlementMaximumPages: 10,
    },
    "STANDARD",
  );

  assert.equal(configuration.maximumPages, 10);
});
