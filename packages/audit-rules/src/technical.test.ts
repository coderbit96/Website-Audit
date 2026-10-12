import assert from "node:assert/strict";
import test from "node:test";

import { TECHNICAL_RULE_THRESHOLDS } from "./technical-rules.js";
import {
  analyzeTechnicalSite,
  type TechnicalAuditInput,
  type TechnicalPageInput,
} from "./technical.js";

function page(
  url: string,
  overrides: Partial<TechnicalPageInput> = {},
): TechnicalPageInput {
  return {
    requestedUrl: url,
    url,
    normalizedUrl: url,
    statusCode: 200,
    redirectCount: 0,
    redirectChain: [],
    fetchErrorCode: null,
    depth: 0,
    responseTimeMs: 50,
    pageSizeBytes: 1_000,
    contentType: "text/html",
    indexable: true,
    robotsDirectives: [],
    canonical: url,
    canonicalDeclarations: [url],
    internalLinks: [],
    mixedContentResources: [],
    mixedContentResourceCount: 0,
    ...overrides,
  };
}

function input(overrides: Partial<TechnicalAuditInput>): TechnicalAuditInput {
  return {
    pages: [],
    sitemap: {
      declaredUrls: ["https://example.com/sitemap.xml"],
      processedUrls: ["https://example.com/sitemap.xml"],
      rejectedUrlCount: 0,
    },
    externalLinkChecks: {
      enabled: false,
      candidateCount: 0,
      checkedCount: 0,
      truncated: false,
      results: [],
    },
    ...overrides,
  };
}

test("emits every requested technical rule only from supporting evidence", () => {
  const missing = "https://example.com/missing";
  const pages = [
    page("https://example.com/", {
      internalLinks: [{ url: missing }],
    }),
    page(missing, { statusCode: 404 }),
    page("https://example.com/server-error", { statusCode: 503 }),
    page("https://example.com/redirect", {
      url: "https://example.com/final",
      normalizedUrl: "https://example.com/final",
      redirectCount: 1,
      redirectChain: [
        {
          sourceUrl: "https://example.com/redirect",
          statusCode: 301,
          destinationUrl: "https://example.com/final",
        },
      ],
    }),
    page("https://example.com/chain", {
      url: "https://example.com/chain-final",
      normalizedUrl: "https://example.com/chain-final",
      redirectCount: 2,
      redirectChain: [
        {
          sourceUrl: "https://example.com/chain",
          statusCode: 301,
          destinationUrl: "https://example.com/chain-middle",
        },
        {
          sourceUrl: "https://example.com/chain-middle",
          statusCode: 302,
          destinationUrl: "https://example.com/chain-final",
        },
      ],
    }),
    page("https://example.com/loop", {
      statusCode: null,
      fetchErrorCode: "REDIRECT_LOOP",
    }),
    page("http://example.com/insecure"),
    page("https://example.com/private", {
      statusCode: null,
      fetchErrorCode: "ROBOTS_DENIED",
    }),
    page("https://example.com/one/two/three/four/five"),
    page("https://example.com/canonical", {
      canonical: "https://example.com/preferred",
      canonicalDeclarations: [
        "https://example.com/preferred",
        "https://example.com/other",
      ],
    }),
    page("https://example.com/mixed", {
      mixedContentResourceCount: 1,
      mixedContentResources: [
        { url: "http://cdn.example.com/app.js", type: "SCRIPT" },
      ],
    }),
    page("https://example.com/slow", {
      responseTimeMs: TECHNICAL_RULE_THRESHOLDS.slowResponseMilliseconds + 1,
    }),
    page("https://example.com/large", {
      pageSizeBytes: TECHNICAL_RULE_THRESHOLDS.largePageBytes + 1,
    }),
    page("https://example.com/noindex", {
      indexable: false,
      robotsDirectives: ["noindex"],
    }),
  ];
  const audit = input({
    pages,
    sitemap: { declaredUrls: [], processedUrls: [], rejectedUrlCount: 0 },
    externalLinkChecks: {
      enabled: true,
      candidateCount: 1,
      checkedCount: 1,
      truncated: false,
      results: [
        {
          url: "https://outside.example/gone",
          statusCode: 410,
          sourceUrls: ["https://example.com/"],
          errorCode: null,
        },
      ],
    },
  });

  const first = analyzeTechnicalSite(audit);
  const second = analyzeTechnicalSite(audit);
  const codes = new Set(first.findings.map((finding) => finding.ruleCode));

  assert.deepEqual(first, second);
  assert.deepEqual(
    codes,
    new Set([
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
    ]),
  );
  for (const finding of first.findings) {
    assert.equal(finding.category, "TECHNICAL");
    assert.ok(Object.keys(finding.evidence).length > 0);
  }
  assert.equal(
    first.findings.find((finding) => finding.ruleCode === "TECH_HTTP_URL")
      ?.affectedUrl,
    "http://example.com/insecure",
  );
});

test("aggregates repeated site-wide patterns and bounds retained evidence", () => {
  const pages = Array.from({ length: 150 }, (_, index) =>
    page(`https://example.com/page-${index}`, {
      responseTimeMs:
        TECHNICAL_RULE_THRESHOLDS.slowResponseMilliseconds + index + 1,
    }),
  );
  const report = analyzeTechnicalSite(input({ pages }));
  const slow = report.findings.filter(
    (finding) => finding.ruleCode === "TECH_SLOW_RESPONSE",
  );

  assert.equal(slow.length, 1);
  assert.equal(slow[0]?.affectedUrl, null);
  assert.equal(slow[0]?.occurrences, 150);
  assert.equal(
    (slow[0]?.evidence.details as unknown[]).length,
    TECHNICAL_RULE_THRESHOLDS.maximumEvidenceUrls,
  );
  assert.equal(slow[0]?.evidence.evidenceTruncated, true);
});

test("does not label ambiguous external responses as broken", () => {
  const report = analyzeTechnicalSite(
    input({
      externalLinkChecks: {
        enabled: true,
        candidateCount: 3,
        checkedCount: 3,
        truncated: false,
        results: [
          {
            url: "https://outside.example/forbidden",
            statusCode: 403,
            sourceUrls: ["https://example.com/"],
            errorCode: null,
          },
          {
            url: "https://outside.example/head-not-allowed",
            statusCode: 405,
            sourceUrls: ["https://example.com/"],
            errorCode: null,
          },
          {
            url: "https://outside.example/network-error",
            statusCode: null,
            sourceUrls: ["https://example.com/"],
            errorCode: "TIMEOUT",
          },
        ],
      },
    }),
  );

  assert.equal(
    report.findings.some(
      (finding) => finding.ruleCode === "TECH_BROKEN_EXTERNAL_LINK",
    ),
    false,
  );
});

test("uses authoritative GET statuses for broken internal links", () => {
  const restricted = "https://example.com/restricted";
  const report = analyzeTechnicalSite(
    input({
      pages: [
        page("https://example.com/", {
          internalLinks: [{ url: restricted }],
        }),
        page(restricted, { statusCode: 403 }),
      ],
    }),
  );

  const finding = report.findings.find(
    (item) => item.ruleCode === "TECH_BROKEN_INTERNAL_LINK",
  );
  assert.ok(finding);
  assert.equal(
    (finding.evidence.details as Array<{ statusCode: number }>)[0]?.statusCode,
    403,
  );
});

test("reports a canonical target that is crawled but unhealthy", () => {
  const canonical = "https://example.com/preferred";
  const report = analyzeTechnicalSite(
    input({
      pages: [
        page("https://example.com/source", {
          canonical,
          canonicalDeclarations: [canonical],
        }),
        page(canonical, { statusCode: 500 }),
      ],
    }),
  );
  const finding = report.findings.find(
    (item) => item.ruleCode === "TECH_CANONICAL_CONFLICT",
  );

  assert.ok(finding);
  assert.equal(
    (finding.evidence.details as Array<{ reason: string }>)[0]?.reason,
    "UNHEALTHY_TARGET",
  );
});
