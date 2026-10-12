import assert from "node:assert/strict";
import test from "node:test";

import type {
  SecureHttpOptions,
  SecureHttpResponse,
} from "@website-audit/audit-core";

import { discoverSitemapPages, parseSitemapXml } from "./sitemap.js";
import { normalizeCrawlUrl } from "./url.js";

function response(
  url: string,
  body: string,
  statusCode = 200,
): SecureHttpResponse {
  return {
    requestedUrl: url,
    finalUrl: url,
    statusCode,
    headers: { "content-type": "application/xml" },
    setCookieHeaders: [],
    body: Buffer.from(body),
    durationMs: 5,
    redirectCount: 0,
    redirects: [],
  };
}

test("parses sitemap indexes and URL sets", () => {
  assert.deepEqual(
    parseSitemapXml(
      "<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>",
    ),
    { type: "INDEX", locations: ["https://example.com/a.xml"] },
  );
  assert.deepEqual(
    parseSitemapXml(
      "<urlset><url><loc>https://example.com/page</loc></url></urlset>",
    ),
    { type: "URL_SET", locations: ["https://example.com/page"] },
  );
  assert.deepEqual(parseSitemapXml("<html />"), {
    type: "UNKNOWN",
    locations: [],
  });
});

test("discovers nested same-origin sitemap pages within the page limit", async () => {
  const documents = new Map([
    [
      "https://example.com/index.xml",
      response(
        "https://example.com/index.xml",
        `<sitemapindex>
          <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
          <sitemap><loc>http://127.0.0.1/private.xml</loc></sitemap>
        </sitemapindex>`,
      ),
    ],
    [
      "https://example.com/pages.xml",
      response(
        "https://example.com/pages.xml",
        `<urlset>
          <url><loc>https://example.com/b</loc></url>
          <url><loc>https://example.com/a#section</loc></url>
          <url><loc>https://outside.example/page</loc></url>
          <url><loc>https://example.com/logout</loc></url>
          <url><loc>https://example.com/archive.zip</loc></url>
        </urlset>`,
      ),
    ],
    [
      "https://example.com/sitemap.xml",
      response("https://example.com/sitemap.xml", "", 404),
    ],
  ]);
  const requested: string[] = [];

  const result = await discoverSitemapPages({
    siteOrigin: "https://example.com",
    declaredSitemaps: [
      "https://example.com/index.xml",
      "http://169.254.169.254/latest/meta-data/",
    ],
    maximumPageUrls: 2,
    signal: new AbortController().signal,
    fetchUrl(url, options) {
      assert.ok((options?.timeoutMs ?? Infinity) <= 10_000);
      const normalized = normalizeCrawlUrl(url);
      requested.push(normalized);
      const document = documents.get(normalized);
      if (!document) throw new Error(`Unexpected URL: ${normalized}`);
      return Promise.resolve(document);
    },
  });

  assert.deepEqual(result.pageUrls, [
    "https://example.com/b",
    "https://example.com/a",
  ]);
  assert.deepEqual(result.processedUrls, [
    "https://example.com/index.xml",
    "https://example.com/pages.xml",
  ]);
  assert.equal(result.rejectedUrlCount, 4);
  assert.equal(result.truncated, false);
  assert.equal(
    requested.some((url) => url.includes("127.0.0.1")),
    false,
  );
  assert.equal(
    requested.some((url) => url.includes("169.254.169.254")),
    false,
  );
});

test("rejects a sitemap redirect to a private destination", async () => {
  let privateDestinationRequested = false;
  const result = await discoverSitemapPages({
    siteOrigin: "https://example.com",
    declaredSitemaps: ["https://example.com/redirect.xml"],
    maximumPageUrls: 5,
    signal: new AbortController().signal,
    async fetchUrl(url, options?: SecureHttpOptions) {
      const normalized = normalizeCrawlUrl(url);
      if (normalized === "https://example.com/redirect.xml") {
        const privateUrl = new URL("http://127.0.0.1/private.xml");
        await options?.onRedirect?.(privateUrl, new URL(normalized));
        privateDestinationRequested = true;
      }
      return response(normalized, "", 404);
    },
  });

  assert.equal(privateDestinationRequested, false);
  assert.deepEqual(result.pageUrls, []);
});

test("bounds the number and depth of nested sitemap documents", async () => {
  let requestCount = 0;
  const children = Array.from(
    { length: 30 },
    (_, index) =>
      `<sitemap><loc>https://example.com/child-${index}.xml</loc></sitemap>`,
  ).join("");

  const result = await discoverSitemapPages({
    siteOrigin: "https://example.com",
    declaredSitemaps: ["https://example.com/index.xml"],
    maximumPageUrls: 500,
    signal: new AbortController().signal,
    fetchUrl(url) {
      requestCount += 1;
      const normalized = normalizeCrawlUrl(url);
      return Promise.resolve(
        response(
          normalized,
          normalized.endsWith("/index.xml")
            ? `<sitemapindex>${children}</sitemapindex>`
            : "<urlset />",
        ),
      );
    },
  });

  assert.ok(requestCount <= 20);
  assert.equal(result.truncated, true);
});
