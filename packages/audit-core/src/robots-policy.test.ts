import assert from "node:assert/strict";
import test from "node:test";

import { parseRobotsPolicy } from "./robots-policy.js";

test("honors matching robots rules and exposes sitemap locations", () => {
  const policy = parseRobotsPolicy(
    "https://example.com/robots.txt",
    [
      "User-agent: *",
      "Disallow: /private/",
      "Allow: /private/public/",
      "Crawl-delay: 2",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n"),
  );

  assert.equal(policy.isAllowed("https://example.com/"), true);
  assert.equal(policy.isAllowed("https://example.com/private/secret"), false);
  assert.equal(
    policy.isAllowed("https://example.com/private/public/page"),
    true,
  );
  assert.equal(policy.crawlDelayMs, 2_000);
  assert.deepEqual(policy.sitemapUrls, ["https://example.com/sitemap.xml"]);
});

test("defaults to allowing URLs when no rule applies", () => {
  const policy = parseRobotsPolicy(
    "https://example.com/robots.txt",
    "User-agent: OtherBot\nDisallow: /",
  );

  assert.equal(policy.isAllowed("https://example.com/page"), true);
});

test("prefers rules for the audit crawler user-agent", () => {
  const policy = parseRobotsPolicy(
    "https://example.com/robots.txt",
    [
      "User-agent: *",
      "Disallow: /",
      "User-agent: SiteSignalAuditBot",
      "Disallow: /private/",
      "Allow: /private/public/",
    ].join("\n"),
  );

  assert.equal(policy.isAllowed("https://example.com/public-page"), true);
  assert.equal(policy.isAllowed("https://example.com/private/secret"), false);
  assert.equal(
    policy.isAllowed("https://example.com/private/public/page"),
    true,
  );
  assert.equal(policy.status, "FOUND");
});
