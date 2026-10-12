import assert from "node:assert/strict";
import test from "node:test";

import {
  ScoringCategory,
  calculateAuditScores,
  prepareScoringFindings,
} from "@website-audit/audit-core";

import {
  SECURITY_RULE_DEFINITIONS,
  SECURITY_RULE_THRESHOLDS,
} from "./security-rules.js";
import {
  SecurityDetermination,
  analyzeSecuritySite,
  extractSecurityHtmlObservations,
  type SecurityPageInput,
  type SecurityTransportObservation,
} from "./security.js";

const secureHeaders = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'self'; frame-ancestors 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=()",
};

function page(
  url = "https://example.com/",
  overrides: Partial<SecurityPageInput> = {},
): SecurityPageInput {
  return {
    url,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    headers: secureHeaders,
    setCookieHeaders: ["session=private-value; Secure; HttpOnly; SameSite=Lax"],
    html: "<!doctype html><html><head></head><body></body></html>",
    mixedContentResources: [],
    mixedContentResourceCount: 0,
    ...overrides,
  };
}

function transport(
  overrides: Partial<SecurityTransportObservation> = {},
): SecurityTransportObservation {
  return {
    tlsAvailability: "AVAILABLE",
    tlsUrl: "https://example.com/",
    tlsEvidence: "A validated HTTPS connection was observed.",
    httpToHttpsBehavior: "REDIRECTS_TO_HTTPS",
    httpProbeUrl: "http://example.com/",
    httpFinalUrl: "https://example.com/",
    httpStatusCode: 200,
    httpEvidence: "HTTP upgraded to HTTPS.",
    ...overrides,
  };
}

test("accepts observed secure configuration without inventing findings", () => {
  const report = analyzeSecuritySite({
    pages: [page()],
    transport: transport(),
  });

  assert.deepEqual(report.findings, []);
  assert.equal(report.evaluatedPageCount, 1);
  assert.equal(
    report.checks.some(
      (check) => check.determination === SecurityDetermination.CANNOT_DETERMINE,
    ),
    false,
  );
});

test("compact HTML observations preserve security results without retaining raw pages", () => {
  const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'">
    <meta name="generator" content="CMS 7"></head><body></body></html>`;
  const raw = analyzeSecuritySite({
    pages: [page("https://example.com/", { html })],
    transport: transport(),
  });
  const compact = analyzeSecuritySite({
    pages: [
      page("https://example.com/", {
        html: null,
        htmlObservations: extractSecurityHtmlObservations(html),
      }),
    ],
    transport: transport(),
  });
  assert.deepEqual(compact, raw);
});

test("reports only observed or confirmed passive security evidence", () => {
  const report = analyzeSecuritySite({
    pages: [
      page("https://example.com/", {
        headers: {
          "strict-transport-security": "max-age=0",
          "x-content-type-options": "off",
          "x-frame-options": "ALLOW-FROM https://partner.example",
          server: "nginx/1.25.0",
          "x-powered-by": "Framework 9",
        },
        setCookieHeaders: [
          "session=do-not-store-this; HttpOnly; SameSite=Lax",
          "cross-site=also-secret; SameSite=None",
        ],
        html: '<html><head><meta name="generator" content="CMS 7"></head><body></body></html>',
        mixedContentResources: [
          { url: "http://cdn.example.com/app.js", type: "SCRIPT" },
        ],
        mixedContentResourceCount: 1,
      }),
    ],
    transport: transport({
      httpToHttpsBehavior: "DOES_NOT_REDIRECT",
      httpFinalUrl: "http://example.com/",
      httpEvidence: "The HTTP endpoint returned directly.",
    }),
  });
  const codes = new Set(report.findings.map((finding) => finding.ruleCode));

  assert.deepEqual(
    codes,
    new Set([
      "SEC_HTTP_TO_HTTPS_MISSING",
      "SEC_HSTS_INVALID",
      "SEC_CSP_MISSING",
      "SEC_X_CONTENT_TYPE_OPTIONS_INVALID",
      "SEC_X_FRAME_OPTIONS_INVALID",
      "SEC_REFERRER_POLICY_MISSING",
      "SEC_PERMISSIONS_POLICY_MISSING",
      "SEC_MIXED_CONTENT",
      "SEC_SERVER_HEADER_DISCLOSURE",
      "SEC_TECHNOLOGY_DISCLOSURE",
      "SEC_COOKIE_SECURE_MISSING",
      "SEC_COOKIE_SAMESITE_NONE_INSECURE",
    ]),
  );
  for (const finding of report.findings) {
    assert.equal(finding.category, "SECURITY");
    assert.ok(finding.evidence.determination);
  }
  const serialized = JSON.stringify(report.findings);
  assert.doesNotMatch(serialized, /do-not-store-this|also-secret/);
  assert.match(serialized, /session|cross-site/);
});

test("distinguishes confirmed missing headers from unknown transport checks", () => {
  const report = analyzeSecuritySite({
    pages: [page("https://example.com/", { headers: {} })],
    transport: transport({
      tlsAvailability: "CANNOT_DETERMINE",
      tlsEvidence: "The request was inconclusive.",
      httpToHttpsBehavior: "CANNOT_DETERMINE",
      httpFinalUrl: null,
      httpStatusCode: null,
      httpEvidence: "The request was inconclusive.",
    }),
  });
  const codes = new Set(report.findings.map((finding) => finding.ruleCode));

  assert.ok(codes.has("SEC_HSTS_MISSING"));
  assert.ok(codes.has("SEC_CSP_MISSING"));
  assert.ok(codes.has("SEC_X_CONTENT_TYPE_OPTIONS_MISSING"));
  assert.ok(codes.has("SEC_FRAME_PROTECTION_MISSING"));
  assert.equal(codes.has("SEC_HTTP_TO_HTTPS_MISSING"), false);
  const tls = report.checks.find((check) => check.check === "TLS_AVAILABILITY");
  assert.equal(tls?.determination, SecurityDetermination.CANNOT_DETERMINE);
  const missing = report.findings.find(
    (finding) => finding.ruleCode === "SEC_HSTS_MISSING",
  );
  assert.equal(
    missing?.evidence.determination,
    SecurityDetermination.CONFIRMED_MISSING,
  );
});

test("reports observed HTTP pages and accepts CSP delivered through HTML", () => {
  const report = analyzeSecuritySite({
    pages: [
      page("http://example.com/", {
        headers: {
          ...secureHeaders,
          "content-security-policy": "",
        },
        html: '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head></html>',
      }),
    ],
    transport: transport(),
  });
  const codes = new Set(report.findings.map((finding) => finding.ruleCode));

  assert.ok(codes.has("SEC_HTTPS_NOT_USED"));
  assert.equal(codes.has("SEC_CSP_MISSING"), false);
  assert.equal(codes.has("SEC_HSTS_MISSING"), false);
});

test("aggregates and bounds disclosure evidence deterministically", () => {
  const pages = Array.from(
    { length: SECURITY_RULE_THRESHOLDS.maximumEvidenceUrls + 5 },
    (_, index) =>
      page(`https://example.com/page-${index}`, {
        headers: { ...secureHeaders, server: `edge-${index}` },
      }),
  );
  const first = analyzeSecuritySite({ pages, transport: transport() });
  const second = analyzeSecuritySite({
    pages: [...pages].reverse(),
    transport: transport(),
  });
  const finding = first.findings.find(
    (item) => item.ruleCode === "SEC_SERVER_HEADER_DISCLOSURE",
  );

  assert.deepEqual(first.findings, second.findings);
  assert.equal(finding?.occurrences, pages.length);
  assert.equal(
    (finding?.evidence.details as unknown[]).length,
    SECURITY_RULE_THRESHOLDS.maximumEvidenceUrls,
  );
  assert.equal(finding?.evidence.evidenceTruncated, true);
});

test("feeds confirmed security findings into deterministic security scoring", () => {
  const report = analyzeSecuritySite({
    pages: [page("https://example.com/", { headers: {} })],
    transport: transport(),
  });
  const scoringFindings = prepareScoringFindings({
    findings: report.findings,
    definitions: SECURITY_RULE_DEFINITIONS,
    totalPageCount: report.evaluatedPageCount,
  });
  const first = calculateAuditScores({
    findings: scoringFindings,
    totalPageCount: report.evaluatedPageCount,
    evaluatedCategories: [ScoringCategory.SECURITY],
    evaluatedPageCounts: { SECURITY: report.evaluatedPageCount },
  });
  const second = calculateAuditScores({
    findings: scoringFindings,
    totalPageCount: report.evaluatedPageCount,
    evaluatedCategories: [ScoringCategory.SECURITY],
    evaluatedPageCounts: { SECURITY: report.evaluatedPageCount },
  });

  assert.deepEqual(first, second);
  assert.equal(first.categories.SECURITY.evaluated, true);
  assert.ok(first.categories.SECURITY.score < 100);
  assert.equal(first.categories.PERFORMANCE.evaluated, false);
});
