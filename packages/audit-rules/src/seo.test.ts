import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSeoPage,
  analyzeSeoSite,
  parseSitemapDocument,
  type SeoPageInput,
} from "./seo.js";

function pageInput(overrides: Partial<SeoPageInput> = {}): SeoPageInput {
  return {
    requestedUrl: "https://example.com/catalog/page-2",
    finalUrl: "https://example.com/catalog/page-2",
    siteOrigin: "https://example.com",
    statusCode: 200,
    headers: {},
    html: "<!doctype html><html><head></head><body></body></html>",
    depth: 1,
    loadTimeMs: 25,
    discoveredVia: "LINK",
    ...overrides,
  };
}

test("detects page-level metadata, heading, social, schema, language, image, anchor, and pagination issues", () => {
  const report = analyzeSeoPage(
    pageInput({
      headers: { "x-robots-tag": "noindex" },
      html: `<!doctype html>
        <html lang="not_a_language">
          <head>
            <title>Tiny</title>
            <meta name="description" content="Short">
            <meta name="robots" content="nofollow">
            <link rel="canonical" href="https://other.example/page">
            <script type="application/ld+json">{"name":"Missing type"}</script>
          </head>
          <body>
            <h1>Main</h1><h1>Second</h1><h3>Skipped</h3><h4></h4>
            <img src="hero.jpg">
            <a href="/other">Click here</a><a href="/empty"></a>
          </body>
        </html>`,
    }),
  );

  const rules = new Set(report.findings.map((finding) => finding.ruleCode));
  for (const rule of [
    "SEO_TITLE_TOO_SHORT",
    "SEO_META_DESCRIPTION_TOO_SHORT",
    "SEO_MULTIPLE_H1",
    "SEO_EMPTY_HEADINGS",
    "SEO_HEADING_HIERARCHY",
    "SEO_CANONICAL_NOT_SELF_REFERENCING",
    "SEO_CANONICAL_ORIGIN_MISMATCH",
    "SEO_META_NOINDEX",
    "SEO_NOFOLLOW",
    "SEO_OG_TITLE_MISSING",
    "SEO_OG_DESCRIPTION_MISSING",
    "SEO_OG_IMAGE_MISSING",
    "SEO_TWITTER_CARD_MISSING",
    "SEO_STRUCTURED_DATA_INVALID",
    "SEO_LANGUAGE_INVALID",
    "SEO_IMAGE_ALT_MISSING",
    "SEO_ANCHOR_TEXT_EMPTY",
    "SEO_ANCHOR_TEXT_GENERIC",
    "SEO_PAGINATION_PREVIOUS_MISSING",
  ]) {
    assert.equal(rules.has(rule), true, `${rule} should be reported`);
  }
  assert.equal(report.noindex, true);
  assert.equal(report.nofollow, true);
  assert.equal(report.imagesMissingAlt, 1);
  assert.equal(report.internalLinkCount, 2);
  for (const finding of report.findings) {
    assert.equal(finding.category, "SEO");
    assert.equal(finding.affectedUrl, report.url);
    assert.equal(typeof finding.scoreImpact, "number");
    assert.equal(typeof finding.recommendation, "string");
    assert.ok(finding.evidence);
  }
});

test("accepts complete SEO metadata without inventing core issues", () => {
  const report = analyzeSeoPage(
    pageInput({
      requestedUrl: "https://example.com/good-page",
      finalUrl: "https://example.com/good-page",
      html: `<!doctype html>
        <html lang="en-US"><head>
          <title>A clear and useful title for this example page</title>
          <meta name="description" content="A useful and specific summary that explains this example page clearly to visitors before they choose to open it from a result.">
          <link rel="canonical" href="https://example.com/good-page">
          <meta property="og:title" content="Example">
          <meta property="og:description" content="Example description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta name="twitter:card" content="summary_large_image">
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
        </head><body>
          <h1>Example page</h1><h2>Section</h2>
          <img src="hero.jpg" alt="Example hero">
          <a href="/related">Related guide</a><a href="/documentation">Documentation</a>
        </body></html>`,
    }),
  );

  const rules = new Set(report.findings.map((finding) => finding.ruleCode));
  assert.equal(rules.has("SEO_TITLE_MISSING"), false);
  assert.equal(rules.has("SEO_META_DESCRIPTION_MISSING"), false);
  assert.equal(rules.has("SEO_H1_MISSING"), false);
  assert.equal(rules.has("SEO_CANONICAL_NOT_SELF_REFERENCING"), false);
  assert.equal(rules.has("SEO_STRUCTURED_DATA_INVALID"), false);
  assert.equal(report.imagesMissingAlt, 0);
});

test("detects duplicate metadata, sitemap orphans, and trailing slash variants", () => {
  const sharedHtml = `<!doctype html><html lang="en"><head>
    <title>A shared title long enough for the editorial guideline</title>
    <meta name="description" content="A shared description that is intentionally long enough to sit inside the editorial review range used by this automated audit test.">
    <link rel="canonical" href="https://example.com/item">
    <meta property="og:title" content="Title"><meta property="og:description" content="Description"><meta property="og:image" content="/image.jpg">
    <meta name="twitter:card" content="summary"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>
  </head><body><h1>Page</h1><a href="/">Home</a></body></html>`;
  const first = analyzeSeoPage(
    pageInput({
      requestedUrl: "https://example.com/item",
      finalUrl: "https://example.com/item",
      discoveredVia: "ROOT",
      html: sharedHtml,
    }),
  );
  const second = analyzeSeoPage(
    pageInput({
      requestedUrl: "https://example.com/item/",
      finalUrl: "https://example.com/item/",
      discoveredVia: "SITEMAP",
      html: sharedHtml,
    }),
  );
  const site = analyzeSeoSite([first, second], ["https://example.com/item/"]);
  const rules = new Set(site.findings.map((finding) => finding.ruleCode));

  assert.equal(rules.has("SEO_DUPLICATE_TITLE"), true);
  assert.equal(rules.has("SEO_DUPLICATE_META_DESCRIPTION"), true);
  assert.equal(rules.has("SEO_ORPHAN_PAGE"), true);
  assert.equal(rules.has("SEO_TRAILING_SLASH_INCONSISTENCY"), true);
});

test("bounds retained links without undercounting or inventing sitemap orphans", () => {
  const links = Array.from(
    { length: 1_000 },
    (_, index) => `<a href="/item-${index}">Item</a>`,
  ).join("");
  const root = analyzeSeoPage(
    pageInput({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      discoveredVia: "ROOT",
      html: `<html><body>${links}<a href="/target">Target</a></body></html>`,
    }),
  );
  const target = analyzeSeoPage(
    pageInput({
      requestedUrl: "https://example.com/target",
      finalUrl: "https://example.com/target",
      discoveredVia: "SITEMAP",
    }),
  );
  assert.equal(root.internalLinkCount, 1_001);
  assert.equal(root.links.length, 1_000);
  assert.equal(root.linksTruncated, true);
  const site = analyzeSeoSite([root, target], [target.url]);
  assert.equal(
    site.findings.some((finding) => finding.ruleCode === "SEO_ORPHAN_PAGE"),
    false,
  );
});

test("parses URL sets and sitemap indexes", () => {
  assert.deepEqual(
    parseSitemapDocument(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc></url></urlset>',
    ),
    { type: "urlset", locations: ["https://example.com/a"] },
  );
  assert.deepEqual(
    parseSitemapDocument(
      "<sitemapindex><sitemap><loc>https://example.com/one.xml</loc></sitemap></sitemapindex>",
    ),
    { type: "index", locations: ["https://example.com/one.xml"] },
  );
});
