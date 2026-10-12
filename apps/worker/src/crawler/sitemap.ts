import type {
  SecureHttpOptions,
  SecureHttpResponse,
} from "@website-audit/audit-core";
import * as cheerio from "cheerio";

import {
  isSafeCrawlDiscoveryUrl,
  isSafePassiveRequestUrl,
  isSameOrigin,
  normalizeCrawlUrl,
} from "./url.js";

const maximumSitemapDocuments = 20;
const maximumSitemapDepth = 3;
const maximumSitemapBodyBytes = 2 * 1024 * 1024;
const maximumSitemapDiscoveryMs = 60_000;
const maximumSitemapRequestMs = 10_000;

type PendingSitemap = {
  url: string;
  depth: number;
};

export type SitemapDiscovery = {
  declaredUrls: string[];
  processedUrls: string[];
  pageUrls: string[];
  rejectedUrlCount: number;
  truncated: boolean;
};

export type SitemapFetcher = (
  url: string | URL,
  options?: SecureHttpOptions,
) => Promise<SecureHttpResponse>;

export type ParsedSitemap = {
  type: "INDEX" | "URL_SET" | "UNKNOWN";
  locations: string[];
};

/** Parses standard sitemap indexes and URL sets without resolving destinations. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const $ = cheerio.load(xml, { xmlMode: true });
  const rootName = $.root().children().first().prop("tagName")?.toLowerCase();
  if (rootName === "sitemapindex") {
    return {
      type: "INDEX",
      locations: $("sitemap > loc")
        .toArray()
        .map((element) => $(element).text().trim())
        .filter(Boolean),
    };
  }
  if (rootName === "urlset") {
    return {
      type: "URL_SET",
      locations: $("url > loc")
        .toArray()
        .map((element) => $(element).text().trim())
        .filter(Boolean),
    };
  }
  return { type: "UNKNOWN", locations: [] };
}

function safeSameOriginUrl(candidate: string, baseUrl: string): string | null {
  try {
    const normalized = normalizeCrawlUrl(candidate, baseUrl);
    return isSameOrigin(normalized, baseUrl) &&
      isSafePassiveRequestUrl(normalized)
      ? normalized
      : null;
  } catch {
    return null;
  }
}

/**
 * Discovers same-origin pages from robots declarations and /sitemap.xml.
 * Network destinations and every redirect remain subject to the secure fetcher.
 */
export async function discoverSitemapPages(input: {
  siteOrigin: string;
  declaredSitemaps: readonly string[];
  maximumPageUrls: number;
  signal: AbortSignal;
  fetchUrl: SitemapFetcher;
}): Promise<SitemapDiscovery> {
  const defaultSitemap = new URL("/sitemap.xml", input.siteOrigin).href;
  const declaredUrls: string[] = [];
  const pending: PendingSitemap[] = [];
  const queuedDocuments = new Set<string>();
  const processedUrls: string[] = [];
  const pageUrls = new Set<string>();
  let rejectedUrlCount = 0;
  let truncated = false;
  const deadline = Date.now() + maximumSitemapDiscoveryMs;

  const enqueueDocument = (
    candidate: string,
    baseUrl: string,
    depth: number,
    declared: boolean,
  ) => {
    const normalized = safeSameOriginUrl(candidate, baseUrl);
    if (!normalized) {
      rejectedUrlCount += 1;
      return;
    }
    if (declared && !declaredUrls.includes(normalized)) {
      declaredUrls.push(normalized);
    }
    if (queuedDocuments.has(normalized)) return;
    if (queuedDocuments.size >= maximumSitemapDocuments) {
      truncated = true;
      return;
    }
    queuedDocuments.add(normalized);
    pending.push({ url: normalized, depth });
  };

  for (const declared of input.declaredSitemaps) {
    enqueueDocument(declared, input.siteOrigin, 0, true);
  }
  enqueueDocument(defaultSitemap, input.siteOrigin, 0, false);

  while (pending.length > 0 && pageUrls.size < input.maximumPageUrls) {
    if (input.signal.aborted) throw input.signal.reason;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      truncated = true;
      break;
    }
    const sitemap = pending.shift();
    if (!sitemap) break;

    try {
      const response = await input.fetchUrl(sitemap.url, {
        signal: input.signal,
        timeoutMs: Math.min(maximumSitemapRequestMs, remainingMs),
        maximumBodyBytes: maximumSitemapBodyBytes,
        onRedirect(redirectUrl) {
          if (
            !isSameOrigin(redirectUrl, input.siteOrigin) ||
            !isSafePassiveRequestUrl(redirectUrl)
          ) {
            throw new Error("The sitemap redirect is not a safe destination.");
          }
        },
      });
      if (
        response.statusCode < 200 ||
        response.statusCode >= 300 ||
        !isSameOrigin(response.finalUrl, input.siteOrigin)
      ) {
        if (!isSameOrigin(response.finalUrl, input.siteOrigin)) {
          rejectedUrlCount += 1;
        }
        continue;
      }

      const parsed = parseSitemapXml(response.body.toString("utf8"));
      if (parsed.type === "UNKNOWN") continue;
      processedUrls.push(normalizeCrawlUrl(response.finalUrl));

      if (parsed.type === "INDEX") {
        if (sitemap.depth >= maximumSitemapDepth) {
          if (parsed.locations.length > 0) truncated = true;
          continue;
        }
        for (const location of parsed.locations) {
          enqueueDocument(location, sitemap.url, sitemap.depth + 1, false);
        }
        continue;
      }

      for (const location of parsed.locations) {
        const normalized = safeSameOriginUrl(location, sitemap.url);
        if (!normalized) {
          rejectedUrlCount += 1;
          continue;
        }
        if (!isSafeCrawlDiscoveryUrl(normalized)) continue;
        if (pageUrls.size >= input.maximumPageUrls) {
          truncated = true;
          break;
        }
        pageUrls.add(normalized);
      }
    } catch (error) {
      if (input.signal.aborted) throw error;
      // Sitemaps are supplementary; an unavailable document does not fail a crawl.
    }
  }

  if (pending.length > 0) truncated = true;
  return {
    declaredUrls,
    processedUrls,
    pageUrls: [...pageUrls],
    rejectedUrlCount,
    truncated,
  };
}
