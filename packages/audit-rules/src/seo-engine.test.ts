import assert from "node:assert/strict";
import test from "node:test";

import { SEO_RULE_THRESHOLDS } from "./seo-rules.js";
import {
  analyzeSeoPage,
  analyzeSeoSite,
  type SeoFindingDraft,
  type SeoPageInput,
} from "./seo.js";

const pageUrl = "https://example.com/page";
const validTitle = "A useful and descriptive title for this audit page";
const validDescription =
  "A useful description that accurately summarizes this audit page for visitors and remains inside the configured editorial thresholds.";

type HtmlOptions = {
  title?: string | null;
  description?: string | null;
  language?: string | null;
  canonicalTags?: string;
  openGraphTags?: string;
  schema?: string;
  body?: string;
};

function html(options: HtmlOptions = {}): string {
  const title = options.title === undefined ? validTitle : options.title;
  const description =
    options.description === undefined ? validDescription : options.description;
  const language = options.language === undefined ? "en" : options.language;
  return `<!doctype html><html${language === null ? "" : ` lang="${language}"`}>
    <head>
      ${title === null ? "" : `<title>${title}</title>`}
      ${description === null ? "" : `<meta name="description" content="${description}">`}
      ${options.canonicalTags ?? `<link rel="canonical" href="${pageUrl}">`}
      ${
        options.openGraphTags ??
        '<meta property="og:title" content="Social title"><meta property="og:description" content="Social description"><meta property="og:image" content="/social.jpg">'
      }
      ${
        options.schema ??
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>'
      }
    </head>
    <body>${
      options.body ??
      '<h1>Page heading</h1><a href="/one">One</a><a href="/two">Two</a><img src="/hero.jpg" alt="Hero">'
    }</body></html>`;
}

function analyze(markup: string, overrides: Partial<SeoPageInput> = {}) {
  return analyzeSeoPage({
    requestedUrl: pageUrl,
    finalUrl: pageUrl,
    siteOrigin: "https://example.com",
    statusCode: 200,
    headers: {},
    html: markup,
    depth: 1,
    loadTimeMs: 10,
    discoveredVia: "LINK",
    ...overrides,
  });
}

function finding(
  findings: readonly SeoFindingDraft[],
  ruleCode: string,
): SeoFindingDraft {
  const result = findings.find((item) => item.ruleCode === ruleCode);
  assert.ok(result, `${ruleCode} should be reported`);
  assert.ok(
    Object.keys(result.evidence).length > 0,
    `${ruleCode} should include evidence`,
  );
  return result;
}

test("reports missing, short, and long titles with central threshold evidence", () => {
  finding(analyze(html({ title: null })).findings, "SEO_TITLE_MISSING");
  const short = finding(
    analyze(
      html({ title: "T".repeat(SEO_RULE_THRESHOLDS.titleMinimumLength - 1) }),
    ).findings,
    "SEO_TITLE_TOO_SHORT",
  );
  const long = finding(
    analyze(
      html({ title: "T".repeat(SEO_RULE_THRESHOLDS.titleMaximumLength + 1) }),
    ).findings,
    "SEO_TITLE_TOO_LONG",
  );
  assert.equal(
    short.evidence.minimumLength,
    SEO_RULE_THRESHOLDS.titleMinimumLength,
  );
  assert.equal(
    long.evidence.maximumLength,
    SEO_RULE_THRESHOLDS.titleMaximumLength,
  );

  for (const length of [
    SEO_RULE_THRESHOLDS.titleMinimumLength,
    SEO_RULE_THRESHOLDS.titleMaximumLength,
  ]) {
    const codes = new Set(
      analyze(html({ title: "T".repeat(length) })).findings.map(
        (item) => item.ruleCode,
      ),
    );
    assert.equal(codes.has("SEO_TITLE_TOO_SHORT"), false);
    assert.equal(codes.has("SEO_TITLE_TOO_LONG"), false);
  }
});

test("reports missing, short, and long descriptions at exact boundaries", () => {
  finding(
    analyze(html({ description: null })).findings,
    "SEO_META_DESCRIPTION_MISSING",
  );
  finding(
    analyze(
      html({
        description: "D".repeat(
          SEO_RULE_THRESHOLDS.metaDescriptionMinimumLength - 1,
        ),
      }),
    ).findings,
    "SEO_META_DESCRIPTION_TOO_SHORT",
  );
  finding(
    analyze(
      html({
        description: "D".repeat(
          SEO_RULE_THRESHOLDS.metaDescriptionMaximumLength + 1,
        ),
      }),
    ).findings,
    "SEO_META_DESCRIPTION_TOO_LONG",
  );

  for (const length of [
    SEO_RULE_THRESHOLDS.metaDescriptionMinimumLength,
    SEO_RULE_THRESHOLDS.metaDescriptionMaximumLength,
  ]) {
    const codes = new Set(
      analyze(html({ description: "D".repeat(length) })).findings.map(
        (item) => item.ruleCode,
      ),
    );
    assert.equal(codes.has("SEO_META_DESCRIPTION_TOO_SHORT"), false);
    assert.equal(codes.has("SEO_META_DESCRIPTION_TOO_LONG"), false);
  }
});

test("reports H1 and heading hierarchy issues with observed headings", () => {
  finding(
    analyze(html({ body: '<a href="/one">One</a><a href="/two">Two</a>' }))
      .findings,
    "SEO_H1_MISSING",
  );
  const multiple = finding(
    analyze(
      html({
        body: '<h1>First</h1><h1>Second</h1><a href="/one">One</a><a href="/two">Two</a>',
      }),
    ).findings,
    "SEO_MULTIPLE_H1",
  );
  const hierarchy = finding(
    analyze(
      html({
        body: '<h1>First</h1><h3>Skipped level</h3><a href="/one">One</a><a href="/two">Two</a>',
      }),
    ).findings,
    "SEO_HEADING_HIERARCHY",
  );
  assert.equal(multiple.evidence.h1Count, 2);
  assert.deepEqual(hierarchy.evidence.jumps, [
    { from: 1, to: 3, text: "Skipped level" },
  ]);
});

test("reports canonical absence and only genuinely conflicting targets", () => {
  finding(
    analyze(html({ canonicalTags: "" })).findings,
    "SEO_CANONICAL_MISSING",
  );
  const conflict = finding(
    analyze(
      html({
        canonicalTags:
          '<link rel="canonical" href="/page"><link rel="canonical" href="/different">',
      }),
    ).findings,
    "SEO_CANONICAL_CONFLICT",
  );
  assert.deepEqual(conflict.evidence.canonicalTargets, [
    "https://example.com/page",
    "https://example.com/different",
  ]);

  const duplicateSameTarget = analyze(
    html({
      canonicalTags:
        '<link rel="canonical" href="/page"><link rel="canonical" href="https://example.com/page">',
    }),
  );
  assert.equal(
    duplicateSameTarget.findings.some(
      (item) => item.ruleCode === "SEO_CANONICAL_CONFLICT",
    ),
    false,
  );
});

test("reports noindex, missing language, and missing Open Graph values", () => {
  const report = analyze(html({ language: null, openGraphTags: "" }), {
    headers: { "x-robots-tag": "noindex" },
  });
  const noindex = finding(report.findings, "SEO_META_NOINDEX");
  finding(report.findings, "SEO_HTML_LANG_MISSING");
  finding(report.findings, "SEO_OG_TITLE_MISSING");
  finding(report.findings, "SEO_OG_DESCRIPTION_MISSING");
  finding(report.findings, "SEO_OG_IMAGE_MISSING");
  assert.equal(noindex.evidence.xRobotsTag, "noindex");
});

test("distinguishes missing alt from empty alt review and detects missing schema", () => {
  const report = analyze(
    html({
      schema: "",
      body: '<h1>Page</h1><img src="/missing.jpg"><img src="/decorative.jpg" alt=""><a href="/one">One</a><a href="/two">Two</a>',
    }),
  );
  const missing = finding(report.findings, "SEO_IMAGE_ALT_MISSING");
  const empty = finding(report.findings, "SEO_EMPTY_ALT_REVIEW");
  finding(report.findings, "SEO_SCHEMA_MISSING");
  assert.deepEqual(missing.evidence.imageSources, [
    "https://example.com/missing.jpg",
  ]);
  assert.deepEqual(empty.evidence.imageSources, [
    "https://example.com/decorative.jpg",
  ]);
});

test("reports poor internal linking using only crawlable internal links", () => {
  const poor = finding(
    analyze(
      html({
        body: '<h1>Page</h1><a href="/one" rel="nofollow">One</a><a href="https://outside.example/">Outside</a>',
      }),
    ).findings,
    "SEO_POOR_INTERNAL_LINKING",
  );
  assert.equal(poor.evidence.crawlableInternalLinkCount, 0);
  assert.equal(
    poor.evidence.minimumInternalLinks,
    SEO_RULE_THRESHOLDS.minimumInternalLinks,
  );
});

test("reports duplicate titles and descriptions with the affected URL set", () => {
  const first = analyze(html(), {
    finalUrl: "https://example.com/first",
    requestedUrl: "https://example.com/first",
    discoveredVia: "ROOT",
  });
  const second = analyze(
    html({
      canonicalTags: '<link rel="canonical" href="/second">',
    }),
    {
      finalUrl: "https://example.com/second",
      requestedUrl: "https://example.com/second",
    },
  );
  const site = analyzeSeoSite([first, second], []);
  const duplicateTitle = finding(site.findings, "SEO_DUPLICATE_TITLE");
  const duplicateDescription = finding(
    site.findings,
    "SEO_DUPLICATE_META_DESCRIPTION",
  );
  assert.equal(duplicateTitle.evidence.duplicateCount, 2);
  assert.equal(duplicateDescription.evidence.duplicateCount, 2);
});
