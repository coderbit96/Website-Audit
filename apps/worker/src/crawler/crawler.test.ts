import assert from "node:assert/strict";
import test from "node:test";

import type {
  RobotsPolicy,
  SecureHttpOptions,
  SecureHttpResponse,
} from "@website-audit/audit-core";
import { SecureHttpError } from "@website-audit/audit-core";

import { crawlWebsite } from "./crawler.js";
import { extractHtmlMetadata } from "./html.js";
import {
  CrawlUrlError,
  isSafeCrawlDiscoveryUrl,
  isSameOrigin,
  normalizeCrawlUrl,
} from "./url.js";
import { controlledPageFixtures } from "../test-fixtures/pages.js";

function response(
  requestedUrl: string,
  body: string,
  options: {
    finalUrl?: string;
    statusCode?: number;
    contentType?: string;
    headers?: Readonly<Record<string, string>>;
    setCookieHeaders?: readonly string[];
    redirectCount?: number;
    redirects?: SecureHttpResponse["redirects"];
  } = {},
): SecureHttpResponse {
  return {
    requestedUrl,
    finalUrl: options.finalUrl ?? requestedUrl,
    statusCode: options.statusCode ?? 200,
    headers: {
      "content-type": options.contentType ?? "text/html; charset=utf-8",
      ...options.headers,
    },
    setCookieHeaders: options.setCookieHeaders ?? [],
    body: Buffer.from(body),
    durationMs: 12,
    redirectCount: options.redirectCount ?? 0,
    redirects: options.redirects ?? [],
  };
}

const allowAllRobots: RobotsPolicy = {
  robotsUrl: "https://example.com/robots.txt",
  status: "FOUND",
  isAllowed: () => true,
  crawlDelayMs: 0,
  sitemapUrls: [],
};

test("normalizes fragments and query order into one crawl identity", () => {
  assert.equal(
    normalizeCrawlUrl("HTTPS://Example.com:443/path?z=2&a=3&a=1#section"),
    "https://example.com/path?a=1&a=3&z=2",
  );
  assert.equal(
    normalizeCrawlUrl("../page#top", "https://example.com/folder/item"),
    "https://example.com/page",
  );
  assert.equal(
    isSameOrigin("https://example.com/a", "https://example.com/b"),
    true,
  );
  assert.equal(
    isSameOrigin("https://example.com", "http://example.com"),
    false,
  );
  assert.throws(
    () => normalizeCrawlUrl("ftp://example.com/file"),
    CrawlUrlError,
  );
  assert.throws(
    () => normalizeCrawlUrl(`https://example.com/?q=${"x".repeat(2_050)}`),
    CrawlUrlError,
  );
});

test("rejects unsafe discovered actions, session URLs, and binary extensions", () => {
  for (const value of [
    "https://example.com/logout",
    "https://example.com/logout.php",
    "https://example.com/account/delete",
    "https://example.com/?action=signout",
    "https://example.com/?sid=private",
    "https://example.com/report.pdf",
    "https://example.com/image.png",
  ]) {
    assert.equal(isSafeCrawlDiscoveryUrl(value), false, value);
  }
  assert.equal(
    isSafeCrawlDiscoveryUrl("https://example.com/search?q=product"),
    true,
  );
});

test("does not request an unsafe starting URL or follow an unsafe page redirect", async () => {
  let requests = 0;
  const dependencies = {
    loadRobots: () => Promise.resolve(allowAllRobots),
    async fetchUrl(
      value: string | URL,
      options?: SecureHttpOptions,
    ): Promise<SecureHttpResponse> {
      requests += 1;
      await options?.onRedirect?.(
        new URL("https://example.com/logout"),
        new URL(value),
      );
      return response(String(value), "<html></html>");
    },
  };
  const settings = {
    maximumPages: 1,
    maximumDepth: 0,
    respectRobotsTxt: false,
  };
  await assert.rejects(
    crawlWebsite({
      startUrl: "https://example.com/logout",
      settings,
      signal: new AbortController().signal,
      dependencies,
    }),
    CrawlUrlError,
  );
  assert.equal(requests, 0);

  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings,
    signal: new AbortController().signal,
    dependencies,
  });
  assert.equal(requests, 1);
  assert.equal(result.pages[0]?.statusCode, null);
});

test("bounds search, query, and date-path crawl traps before requesting them", async () => {
  const candidates = [
    ...Array.from({ length: 20 }, (_, index) => `/search?q=${index}`),
    ...Array.from({ length: 20 }, (_, index) => `/catalog?sort=${index}`),
    ...Array.from(
      { length: 40 },
      (_, index) => `/calendar/2026/10/${index + 1}`,
    ),
    "/logout",
    "/download.zip",
  ];
  const requested: string[] = [];
  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 80,
      maximumDepth: 1,
      respectRobotsTxt: false,
    },
    signal: new AbortController().signal,
    dependencies: {
      loadRobots: () => Promise.resolve(allowAllRobots),
      fetchUrl(value) {
        const url = normalizeCrawlUrl(value);
        if (url.endsWith("/sitemap.xml")) {
          return Promise.resolve(
            response(url, "", {
              statusCode: 404,
              contentType: "application/xml",
            }),
          );
        }
        requested.push(url);
        return Promise.resolve(
          response(
            url,
            url === "https://example.com/"
              ? `<html><body>${candidates.map((candidate) => `<a href="${candidate}">Page</a>`).join("")}</body></html>`
              : "<html><body>Page</body></html>",
          ),
        );
      },
    },
  });

  assert.equal(requested.filter((url) => url.includes("/search?")).length, 3);
  assert.equal(requested.filter((url) => url.includes("/catalog?")).length, 8);
  assert.equal(
    requested.filter((url) => url.includes("/calendar/")).length,
    24,
  );
  assert.equal(
    requested.some((url) => url.endsWith("/logout")),
    false,
  );
  assert.equal(
    requested.some((url) => url.endsWith(".zip")),
    false,
  );
  assert.equal(result.pages.length, 36);
});

test("limits robots fetches across many redirected origins", async () => {
  const robotsOrigins = new Set<string>();
  const links = Array.from(
    { length: 20 },
    (_, index) => `<a href="/page-${index}">Page</a>`,
  ).join("");
  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 21,
      maximumDepth: 1,
      respectRobotsTxt: true,
    },
    signal: new AbortController().signal,
    dependencies: {
      loadRobots(origin) {
        robotsOrigins.add(String(origin));
        return Promise.resolve(allowAllRobots);
      },
      async fetchUrl(value, options) {
        const url = normalizeCrawlUrl(value);
        if (url.endsWith("/sitemap.xml")) {
          return response(url, "", { statusCode: 404 });
        }
        if (url === "https://example.com/") {
          return response(url, `<html><body>${links}</body></html>`);
        }
        const origin = `https://${new URL(url).pathname.slice(1)}.example`;
        await options?.onRedirect?.(new URL(origin), new URL(url));
        return response(url, "<html><body>Page</body></html>");
      },
    },
  });
  assert.equal(result.pages.length, 21);
  assert.ok(robotsOrigins.size <= 16);
  assert.ok(result.pages.some((page) => page.fetchErrorCode === "UNKNOWN"));
});

test("extracts metadata and classifies normalized internal and external links", () => {
  const metadata = extractHtmlMetadata({
    pageUrl: "https://example.com/docs/",
    siteOrigin: "https://example.com",
    xRobotsTag: "noindex",
    html: `<!doctype html><html><head>
      <title> Documentation </title>
      <meta name="description" content=" Product documentation ">
      <link rel="canonical" href="/docs/">
    </head><body>
      <a href="/guide?b=2&a=1#intro">Guide</a>
      <a href="https://outside.example/path">Outside</a>
    </body></html>`,
  });

  assert.equal(metadata.title, "Documentation");
  assert.equal(metadata.description, "Product documentation");
  assert.equal(metadata.canonical, "https://example.com/docs/");
  assert.deepEqual(metadata.canonicalDeclarations, [
    "https://example.com/docs/",
  ]);
  assert.equal(metadata.indexable, false);
  assert.equal(
    metadata.internalLinks[0]?.normalizedUrl,
    "https://example.com/guide?a=1&b=2",
  );
  assert.equal(metadata.externalLinks.length, 1);
});

test("crawls a controlled site with bounded concurrency, depth, status, and duplicate prevention", async () => {
  const documents = new Map([
    [
      "https://example.com/",
      response("https://example.com/", controlledPageFixtures.crawlRoot, {
        headers: { server: "controlled-test" },
        setCookieHeaders: [
          "session=private-value; Secure; HttpOnly; SameSite=Lax",
        ],
      }),
    ],
    [
      "https://example.com/a",
      response("https://example.com/a", controlledPageFixtures.crawlChild, {
        finalUrl: "https://example.com/a-final",
        redirectCount: 1,
        redirects: [
          {
            sourceUrl: "https://example.com/a",
            statusCode: 301,
            destinationUrl: "https://example.com/a-final",
          },
        ],
      }),
    ],
    [
      "https://example.com/search?a=1&b=2",
      response(
        "https://example.com/search?a=1&b=2",
        controlledPageFixtures.notFound,
        { statusCode: 404 },
      ),
    ],
  ]);
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const requested: string[] = [];

  const fetchUrl = async (value: string | URL): Promise<SecureHttpResponse> => {
    const url = normalizeCrawlUrl(value);
    requested.push(url);
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    if (url !== "https://example.com/") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    activeRequests -= 1;
    const result = documents.get(url);
    if (!result) throw new Error(`Unexpected controlled URL: ${url}`);
    return result;
  };

  const progress: number[] = [];
  const callbackOrder: string[] = [];
  let observedRootCookies: readonly string[] = [];
  const result = await crawlWebsite({
    startUrl: "https://example.com/#fragment",
    settings: {
      maximumPages: 3,
      maximumDepth: 1,
      concurrency: 2,
      respectRobotsTxt: true,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl,
      loadRobots: () => Promise.resolve(allowAllRobots),
    },
    callbacks: {
      onPage(page, document) {
        if (page.discoveredVia === "ROOT") {
          assert.equal(document?.headers.server, "controlled-test");
          observedRootCookies = document?.setCookieHeaders ?? [];
        }
      },
      onDiscovery(discovery) {
        callbackOrder.push("discovery");
        assert.equal(discovery.robots.status, "FOUND");
      },
      onProgress(update) {
        callbackOrder.push(`crawl-${update.pagesCrawled}`);
        progress.push(update.pagesCrawled);
      },
    },
  });

  assert.equal(result.pages.length, 3);
  assert.equal(result.discoveredUrls.length, 4);
  assert.equal(requested.filter((url) => url.endsWith("/a")).length, 1);
  assert.equal(requested.includes("https://example.com/deep"), false);
  assert.equal(maximumActiveRequests, 2);
  assert.deepEqual(progress, [1, 2, 3]);
  assert.deepEqual(callbackOrder.slice(0, 2), ["discovery", "crawl-1"]);
  assert.deepEqual(observedRootCookies, [
    "session=private-value; Secure; HttpOnly; SameSite=Lax",
  ]);

  const root = result.pages[0];
  assert.equal(root && "findings" in root, false);
  assert.equal(
    root?.pageSizeBytes,
    documents.get("https://example.com/")?.body.byteLength,
  );
  assert.equal(root?.contentType, "text/html");
  assert.equal(root?.internalLinks.length, 2);
  assert.equal(root?.externalLinks.length, 1);

  const redirected = result.pages.find((page) => page.redirectCount === 1);
  assert.equal(redirected?.url, "https://example.com/a-final");
  assert.equal(redirected?.redirectUrl, "https://example.com/a-final");
  assert.equal(redirected?.redirectChain.length, 1);
  assert.equal(
    result.pages.some((page) => page.statusCode === 404),
    true,
  );
});

test("retains redirect-loop evidence as a crawl fact", async () => {
  const loopUrl = "https://example.com/loop";
  const redirectChain = [
    {
      sourceUrl: loopUrl,
      statusCode: 302,
      destinationUrl: "https://example.com/other",
    },
    {
      sourceUrl: "https://example.com/other",
      statusCode: 302,
      destinationUrl: loopUrl,
    },
  ];
  const result = await crawlWebsite({
    startUrl: loopUrl,
    settings: {
      maximumPages: 1,
      maximumDepth: 0,
      respectRobotsTxt: false,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl: () =>
        Promise.reject(
          new SecureHttpError("REDIRECT_LOOP", "Redirect loop.", {
            retryable: false,
            redirects: redirectChain,
          }),
        ),
      loadRobots: () => Promise.resolve(allowAllRobots),
    },
  });

  assert.equal(result.pages[0]?.fetchErrorCode, "REDIRECT_LOOP");
  assert.equal(result.pages[0]?.redirectCount, 2);
  assert.equal(result.pages[0]?.redirectUrl, loopUrl);
  assert.deepEqual(result.pages[0]?.redirectChain, redirectChain);
});

test("retains a website request timeout as a crawl fact", async () => {
  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 1,
      maximumDepth: 0,
      respectRobotsTxt: false,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl: () =>
        Promise.reject(
          new SecureHttpError("REQUEST_TIMEOUT", "Request timed out.", {
            retryable: true,
          }),
        ),
      loadRobots: () => Promise.resolve(allowAllRobots),
    },
  });

  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.fetchErrorCode, "REQUEST_TIMEOUT");
  assert.equal(result.pages[0]?.statusCode, null);
});

test("hard-clamps page and concurrency settings", async () => {
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const rootLinks = Array.from(
    { length: 20 },
    (_, index) => `<a href="/page-${index}">Page</a>`,
  ).join("");

  const fetchUrl = async (value: string | URL): Promise<SecureHttpResponse> => {
    const url = normalizeCrawlUrl(value);
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequests -= 1;
    return response(
      url,
      url === "https://example.com/"
        ? `<html><body>${rootLinks}</body></html>`
        : "<html><body>Page</body></html>",
    );
  };

  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 2,
      maximumDepth: 50,
      concurrency: 50,
      respectRobotsTxt: false,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl,
      loadRobots: () => Promise.resolve(allowAllRobots),
    },
  });

  assert.equal(result.pages.length, 2);
  assert.ok(maximumActiveRequests <= 8);
});

test("checks deduplicated external links with bounded HEAD requests when enabled", async () => {
  const externalUrl = "https://outside.example/missing";
  const headMismatchUrl = "https://outside.example/works-with-get";
  const externalPdfUrl = "https://outside.example/guide.pdf";
  const externalRequests: Array<{ url: string; method: string | undefined }> =
    [];
  const fetchUrl = (
    value: string | URL,
    options?: SecureHttpOptions,
  ): Promise<SecureHttpResponse> => {
    const url = normalizeCrawlUrl(value);
    if (new URL(url).origin === "https://outside.example") {
      externalRequests.push({ url, method: options?.method });
      const statusCode =
        url === externalPdfUrl ||
        (url === headMismatchUrl && options?.method === "GET")
          ? 200
          : 404;
      return Promise.resolve(response(url, "", { statusCode }));
    }
    if (url.endsWith("/sitemap.xml")) {
      return Promise.resolve(
        response(url, "", { statusCode: 404, contentType: "text/xml" }),
      );
    }
    return Promise.resolve(
      response(
        url,
        `<html><body>
          <a href="${externalUrl}#first">First</a>
          <a href="${externalUrl}#second">Second</a>
          <a href="${headMismatchUrl}">Head mismatch</a>
          <a href="${externalPdfUrl}">PDF</a>
          <a href="https://outside.example/logout">Do not request</a>
        </body></html>`,
      ),
    );
  };

  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 1,
      maximumDepth: 0,
      respectRobotsTxt: false,
      checkExternalLinks: true,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl,
      loadRobots: () => Promise.resolve(allowAllRobots),
    },
  });

  for (const url of [externalUrl, headMismatchUrl]) {
    assert.deepEqual(
      externalRequests
        .filter((request) => request.url === url)
        .map((request) => request.method),
      ["HEAD", "GET"],
    );
  }
  assert.deepEqual(
    externalRequests
      .filter((request) => request.url === externalPdfUrl)
      .map((request) => request.method),
    ["HEAD"],
  );
  assert.equal(
    externalRequests.some((request) => request.url.endsWith("/logout")),
    false,
  );
  assert.equal(result.externalLinkChecks.enabled, true);
  assert.equal(result.externalLinkChecks.candidateCount, 3);
  assert.equal(result.externalLinkChecks.checkedCount, 3);
  const checksByUrl = new Map(
    result.externalLinkChecks.results.map((check) => [check.url, check]),
  );
  assert.equal(checksByUrl.get(externalUrl)?.statusCode, 404);
  assert.equal(checksByUrl.get(headMismatchUrl)?.statusCode, 200);
  assert.deepEqual(checksByUrl.get(externalUrl)?.sourceUrls, [
    "https://example.com/",
  ]);
});

test("bounds retained external candidates before optional status checks", async () => {
  const requestedChecks: string[] = [];
  const links = (offset: number) =>
    Array.from(
      { length: 800 },
      (_, index) =>
        `<a href="https://outside.example/item-${offset + index}">Outside</a>`,
    ).join("");
  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 2,
      maximumDepth: 1,
      respectRobotsTxt: false,
      checkExternalLinks: true,
    },
    signal: new AbortController().signal,
    dependencies: {
      loadRobots: () => Promise.resolve(allowAllRobots),
      fetchUrl(value) {
        const url = normalizeCrawlUrl(value);
        if (new URL(url).origin === "https://outside.example") {
          requestedChecks.push(url);
          return Promise.resolve(response(url, "", { statusCode: 200 }));
        }
        if (url.endsWith("/sitemap.xml")) {
          return Promise.resolve(response(url, "", { statusCode: 404 }));
        }
        return Promise.resolve(
          response(
            url,
            `<html><body>${links(url.endsWith("/second") ? 800 : 0)}${url.endsWith("/") ? '<a href="/second">Next</a>' : ""}</body></html>`,
          ),
        );
      },
    },
  });
  assert.equal(result.externalLinkChecks.candidateCount, 1_000);
  assert.equal(result.externalLinkChecks.checkedCount, 100);
  assert.equal(requestedChecks.length, 100);
  assert.equal(result.externalLinkChecks.truncated, true);
});

test("discovers robots metadata without applying rules when disabled", async () => {
  const fetchedPages: string[] = [];
  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 2,
      maximumDepth: 1,
      respectRobotsTxt: false,
    },
    signal: new AbortController().signal,
    dependencies: {
      loadRobots: () =>
        Promise.resolve({
          ...allowAllRobots,
          isAllowed: () => false,
        }),
      fetchUrl(value) {
        const url = normalizeCrawlUrl(value);
        if (url.endsWith("/sitemap.xml")) {
          return Promise.resolve(
            response(url, "", {
              statusCode: 404,
              contentType: "application/xml",
            }),
          );
        }
        fetchedPages.push(url);
        return Promise.resolve(
          response(
            url,
            url.endsWith("/")
              ? '<html><body><a href="/allowed-by-setting">Page</a></body></html>'
              : "<html><body>Page</body></html>",
          ),
        );
      },
    },
  });

  assert.equal(
    fetchedPages.includes("https://example.com/allowed-by-setting"),
    true,
  );
  assert.equal(result.discovery.robots.applied, false);
});

test("respects robots rules and adds sitemap URLs to the crawl frontier", async () => {
  const fetchedPages: string[] = [];
  const robots: RobotsPolicy = {
    robotsUrl: "https://example.com/robots.txt",
    status: "FOUND",
    isAllowed: (url) => !new URL(url).pathname.startsWith("/private"),
    crawlDelayMs: 0,
    sitemapUrls: ["https://example.com/site-index.xml"],
  };
  const fetchUrl = (value: string | URL): Promise<SecureHttpResponse> => {
    const url = normalizeCrawlUrl(value);
    if (url.endsWith(".xml")) {
      if (url.endsWith("/sitemap.xml")) {
        return Promise.resolve(
          response(url, "", {
            statusCode: 404,
            contentType: "application/xml",
          }),
        );
      }
      return Promise.resolve(
        url.endsWith("site-index.xml")
          ? response(
              url,
              `<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>`,
              { contentType: "application/xml" },
            )
          : response(
              url,
              `<urlset><url><loc>https://example.com/from-sitemap</loc></url></urlset>`,
              { contentType: "application/xml" },
            ),
      );
    }
    fetchedPages.push(url);
    return Promise.resolve(
      response(
        url,
        url === "https://example.com/"
          ? '<html><body><a href="/private/secret">Private</a><a href="/linked">Linked</a></body></html>'
          : "<html><body>Page</body></html>",
      ),
    );
  };

  const result = await crawlWebsite({
    startUrl: "https://example.com/",
    settings: {
      maximumPages: 4,
      maximumDepth: 1,
      concurrency: 2,
      respectRobotsTxt: true,
    },
    signal: new AbortController().signal,
    dependencies: {
      fetchUrl,
      loadRobots: () => Promise.resolve(robots),
    },
  });

  assert.equal(
    fetchedPages.includes("https://example.com/private/secret"),
    false,
  );
  assert.equal(
    result.pages.find((page) => page.url.endsWith("/private/secret"))
      ?.statusCode,
    null,
  );
  assert.equal(
    result.pages.find((page) => page.url.endsWith("/from-sitemap"))
      ?.discoveredVia,
    "SITEMAP",
  );
  assert.equal(result.discovery.robots.status, "FOUND");
  assert.equal(result.discovery.robots.applied, true);
  assert.deepEqual(result.discovery.sitemap.processedUrls, [
    "https://example.com/site-index.xml",
    "https://example.com/pages.xml",
  ]);
});
