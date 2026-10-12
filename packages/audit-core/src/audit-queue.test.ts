import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESSIBILITY_BROWSER_PAGE_LIMITS,
  MOBILE_BROWSER_PAGE_LIMITS,
  PUBLIC_AUDIT_MAXIMUM_DEPTH,
  PUBLIC_AUDIT_MAXIMUM_PAGES,
  AUDIT_PRESET_DEFINITIONS,
  AuditProcessingError,
  calculateAuditRetryDelay,
  getAccessibilityBrowserPageLimit,
  getMobileBrowserPageLimit,
  getSafeAuditFailure,
  sanitizeAuditErrorMessage,
} from "./audit-queue.js";

test("caps browser accessibility analysis by preset and audit page limit", () => {
  assert.equal(getAccessibilityBrowserPageLimit("QUICK", 10), 3);
  assert.equal(getAccessibilityBrowserPageLimit("STANDARD", 5), 5);
  assert.equal(getAccessibilityBrowserPageLimit("FULL", 500), 20);
  assert.equal(getAccessibilityBrowserPageLimit("FULL", 0), 0);
  assert.deepEqual(ACCESSIBILITY_BROWSER_PAGE_LIMITS, {
    QUICK: 3,
    STANDARD: 10,
    FULL: 20,
  });
});

test("caps mobile browser observations by preset and audit page limit", () => {
  assert.equal(getMobileBrowserPageLimit("QUICK", 10), 1);
  assert.equal(getMobileBrowserPageLimit("STANDARD", 2), 2);
  assert.equal(getMobileBrowserPageLimit("FULL", 500), 5);
  assert.equal(getMobileBrowserPageLimit("FULL", 0), 0);
  assert.deepEqual(MOBILE_BROWSER_PAGE_LIMITS, {
    QUICK: 1,
    STANDARD: 3,
    FULL: 5,
  });
});

test("defines immutable server-side ceilings for every audit preset", () => {
  assert.equal(AUDIT_PRESET_DEFINITIONS.QUICK.maximumPagesLimit, 10);
  assert.equal(AUDIT_PRESET_DEFINITIONS.STANDARD.maximumPagesLimit, 100);
  assert.equal(AUDIT_PRESET_DEFINITIONS.FULL.maximumPagesLimit, 500);
  assert.equal(AUDIT_PRESET_DEFINITIONS.QUICK.maximumDepthLimit, 2);
  assert.equal(AUDIT_PRESET_DEFINITIONS.STANDARD.maximumDepthLimit, 5);
  assert.equal(AUDIT_PRESET_DEFINITIONS.FULL.maximumDepthLimit, 10);
});

test("defines a smaller immutable public audit crawl boundary", () => {
  assert.equal(PUBLIC_AUDIT_MAXIMUM_PAGES, 5);
  assert.equal(PUBLIC_AUDIT_MAXIMUM_DEPTH, 1);
});

test("uses capped exponential retry backoff", () => {
  assert.equal(calculateAuditRetryDelay(1), 5_000);
  assert.equal(calculateAuditRetryDelay(2), 10_000);
  assert.equal(calculateAuditRetryDelay(3), 20_000);
  assert.equal(calculateAuditRetryDelay(99), 300_000);
});

test("stores only bounded, control-free error text and redacts URL credentials", () => {
  const sanitized = sanitizeAuditErrorMessage(
    `Failed\nfor https://admin:secret@example.com ${"x".repeat(600)}`,
  );

  assert.doesNotMatch(sanitized, /secret/);
  assert.doesNotMatch(sanitized, /\n/);
  assert.equal(sanitized.length, 500);
});

test("exposes approved processing errors and hides unexpected details", () => {
  assert.deepEqual(
    getSafeAuditFailure(
      new AuditProcessingError("Audit timed out.", {
        retryable: true,
        code: "AUDIT_TIMEOUT",
        stage: "CRAWLING",
        step: "CRAWLING",
      }),
    ),
    {
      code: "AUDIT_TIMEOUT",
      message: "Audit timed out.",
      retryable: true,
      stage: "CRAWLING",
      step: "CRAWLING",
    },
  );
  assert.deepEqual(getSafeAuditFailure(new Error("database-password")), {
    code: "UNEXPECTED_ERROR",
    message: "Audit processing failed unexpectedly.",
    retryable: true,
  });
});
