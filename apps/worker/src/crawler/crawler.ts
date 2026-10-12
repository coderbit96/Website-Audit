import {
  SecureHttpError,
  loadRobotsPolicy,
  secureFetchUrl,
  type RobotsPolicy,
  type SecureHttpErrorCode,
  type SecureHttpResponse,
} from "@website-audit/audit-core";

import {
  extractHtmlMetadata,
  isHtmlResponse,
  normalizeContentType,
} from "./html.js";
import { discoverSitemapPages } from "./sitemap.js";
import {
  CrawlUrlError,
  isSafeCrawlDiscoveryUrl,
  isSafePassiveRequestUrl,
  isSameOrigin,
  normalizeCrawlUrl,
} from "./url.js";
import type {
  CrawlDiscoveryInfo,
  CrawlDiscoverySource,
  CrawlDocument,
  CrawledPage,
  CrawlerCallbacks,
  CrawlerDependencies,
  CrawlerSettings,
  CrawlResult,
  ExternalLinkCheck,
} from "./types.js";

const hardMaximumPages = 500;
const hardMaximumDepth = 10;
const hardMaximumConcurrency = 8;
const hardMaximumDiscoveredUrls = 5_000;
const hardMaximumExternalLinkChecks = 100;
const hardMaximumExternalCandidatesRetained = 1_000;
const hardMaximumExternalCheckConcurrency = 4;
const hardMaximumRobotsOrigins = 16;
const maximumQueryVariantsPerPath = 8;
const maximumSearchVariantsPerPath = 3;
const maximumDatePathVariants = 24;

type PendingUrl = {
  url: string;
  depth: number;
  discoveredVia: CrawlDiscoverySource;
};

type ProcessedUrl = {
  page: CrawledPage;
  document: CrawlDocument | null;
};

const defaultDependencies: CrawlerDependencies = {
  fetchUrl: secureFetchUrl,
  loadRobots: loadRobotsPolicy,
};

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function safeFetchError(error: unknown): string {
  if (error instanceof SecureHttpError) {
    return `Request failed: ${error.code.toLowerCase().replaceAll("_", " ")}.`;
  }
  if (error instanceof RobotsDeniedError) return error.message;
  return "The page could not be fetched.";
}

function fetchErrorCode(
  error: unknown,
): SecureHttpErrorCode | "ROBOTS_DENIED" | "UNKNOWN" {
  if (error instanceof SecureHttpError) return error.code;
  if (error instanceof RobotsDeniedError) return "ROBOTS_DENIED";
  return "UNKNOWN";
}

class RobotsDeniedError extends Error {
  constructor(url: URL) {
    super(`robots.txt disallows ${url.pathname || "/"}.`);
    this.name = "RobotsDeniedError";
  }
}

/**
 * Crawls HTML with bounded breadth-first concurrency. It extracts page facts
 * and links only; audit findings belong to separate rule-engine consumers.
 */
export async function crawlWebsite(input: {
  startUrl: string | URL;
  settings: CrawlerSettings;
  signal: AbortSignal;
  callbacks?: CrawlerCallbacks;
  dependencies?: Partial<CrawlerDependencies>;
}): Promise<CrawlResult> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const maximumPages = clampInteger(
    input.settings.maximumPages,
    10,
    1,
    hardMaximumPages,
  );
  const maximumDepth = clampInteger(
    input.settings.maximumDepth,
    2,
    0,
    hardMaximumDepth,
  );
  const concurrency = clampInteger(
    input.settings.concurrency,
    4,
    1,
    hardMaximumConcurrency,
  );
  const maximumDiscovered = Math.min(
    hardMaximumDiscoveredUrls,
    Math.max(maximumPages * 20, maximumPages),
  );
  const startUrl = normalizeCrawlUrl(input.startUrl);
  if (!isSafeCrawlDiscoveryUrl(startUrl)) {
    throw new CrawlUrlError("The website URL is not a safe HTML crawl target.");
  }
  const initialOrigin = new URL(startUrl).origin;
  const policies = new Map<string, RobotsPolicy>();
  const policyPromises = new Map<string, Promise<RobotsPolicy>>();
  const requestChains = new Map<string, Promise<void>>();
  const nextRequestAt = new Map<string, number>();

  async function policyFor(origin: string): Promise<RobotsPolicy> {
    const existing = policies.get(origin);
    if (existing) return existing;
    if (
      !policyPromises.has(origin) &&
      policies.size + policyPromises.size >= hardMaximumRobotsOrigins
    ) {
      throw new CrawlUrlError(
        "Too many distinct redirect origins were encountered.",
      );
    }
    const pendingPolicy =
      policyPromises.get(origin) ??
      dependencies.loadRobots(origin, { signal: input.signal });
    policyPromises.set(origin, pendingPolicy);
    try {
      const policy = await pendingPolicy;
      policies.set(origin, policy);
      return policy;
    } finally {
      policyPromises.delete(origin);
    }
  }

  async function prepareDestination(url: URL): Promise<void> {
    const previous = requestChains.get(url.origin) ?? Promise.resolve();
    const scheduled = previous
      .catch(() => undefined)
      .then(async () => {
        const policy = input.settings.respectRobotsTxt
          ? await policyFor(url.origin)
          : null;
        if (policy && !policy.isAllowed(url)) throw new RobotsDeniedError(url);
        const earliest = nextRequestAt.get(url.origin) ?? 0;
        await wait(Math.max(0, earliest - Date.now()), input.signal);
        if (policy?.crawlDelayMs) {
          nextRequestAt.set(url.origin, Date.now() + policy.crawlDelayMs);
        }
      });
    requestChains.set(url.origin, scheduled);
    await scheduled;
  }

  async function fetchUrl(url: string): Promise<SecureHttpResponse> {
    const destination = new URL(url);
    await prepareDestination(destination);
    return dependencies.fetchUrl(destination, {
      signal: input.signal,
      skipNonHtmlBody: true,
      timeoutMs: clampInteger(
        input.settings.requestTimeoutMs,
        15_000,
        1_000,
        60_000,
      ),
      maximumBodyBytes: clampInteger(
        input.settings.maximumBodyBytes,
        2 * 1024 * 1024,
        64 * 1024,
        5 * 1024 * 1024,
      ),
      onRedirect: async (redirect) => {
        if (!isSafeCrawlDiscoveryUrl(redirect)) {
          throw new CrawlUrlError(
            "The redirect is not a safe HTML crawl target.",
          );
        }
        await prepareDestination(redirect);
      },
    });
  }

  async function processUrl(
    pending: PendingUrl,
    siteOrigin: string,
  ): Promise<ProcessedUrl> {
    try {
      const response = await fetchUrl(pending.url);
      input.signal.throwIfAborted();
      const normalizedUrl = normalizeCrawlUrl(response.finalUrl);
      const contentType = normalizeContentType(
        response.headers["content-type"],
      );
      const htmlResponse = isHtmlResponse(
        response.headers["content-type"],
        response.body,
      );
      const html = htmlResponse ? response.body.toString("utf8") : null;
      const metadataSiteOrigin =
        pending.discoveredVia === "ROOT"
          ? new URL(response.finalUrl).origin
          : siteOrigin;
      const metadata = html
        ? extractHtmlMetadata({
            html,
            pageUrl: response.finalUrl,
            siteOrigin: metadataSiteOrigin,
            ...(response.headers["x-robots-tag"]
              ? { xRobotsTag: response.headers["x-robots-tag"] }
              : {}),
          })
        : null;
      input.signal.throwIfAborted();
      const page: CrawledPage = {
        requestedUrl: pending.url,
        url: response.finalUrl,
        normalizedUrl,
        redirectUrl:
          normalizeCrawlUrl(pending.url) === normalizedUrl
            ? null
            : response.finalUrl,
        redirectCount: response.redirectCount,
        redirectChain: response.redirects,
        fetchErrorCode: null,
        statusCode: response.statusCode,
        contentType,
        title: metadata?.title ?? null,
        description: metadata?.description ?? null,
        canonical: metadata?.canonical ?? null,
        indexable: metadata?.indexable ?? true,
        followable: metadata?.followable ?? true,
        depth: pending.depth,
        responseTimeMs: response.durationMs,
        pageSizeBytes: response.body.byteLength,
        discoveredVia: pending.discoveredVia,
        internalLinks: metadata?.internalLinks ?? [],
        externalLinks: metadata?.externalLinks ?? [],
        metadata,
        errorMessage: null,
      };
      return {
        page,
        document:
          html === null
            ? null
            : {
                html,
                headers: response.headers,
                setCookieHeaders: response.setCookieHeaders,
                siteOrigin: metadataSiteOrigin,
              },
      };
    } catch (error) {
      if (input.signal.aborted) throw error;
      const redirectChain =
        error instanceof SecureHttpError ? error.redirects : [];
      return {
        page: {
          requestedUrl: pending.url,
          url: pending.url,
          normalizedUrl: normalizeCrawlUrl(pending.url),
          redirectUrl:
            redirectChain[redirectChain.length - 1]?.destinationUrl ?? null,
          redirectCount: redirectChain.length,
          redirectChain,
          fetchErrorCode: fetchErrorCode(error),
          statusCode: null,
          contentType: null,
          title: null,
          description: null,
          canonical: null,
          indexable: false,
          followable: false,
          depth: pending.depth,
          responseTimeMs: null,
          pageSizeBytes: 0,
          discoveredVia: pending.discoveredVia,
          internalLinks: [],
          externalLinks: [],
          metadata: null,
          errorMessage: safeFetchError(error),
        },
        document: null,
      };
    }
  }

  const pages: CrawledPage[] = [];
  const discovered = new Set<string>([startUrl]);
  const completedIdentities = new Set<string>();
  const queryVariants = new Map<string, number>();
  const datePathVariants = new Map<string, number>();
  let siteOrigin = initialOrigin;
  let sitemapDiscoveryCompleted = false;
  let sitemapPageUrls: string[] = [];
  let internalLinkUrlsDiscovered = 0;
  const discovery: CrawlDiscoveryInfo = {
    robots: {
      url: new URL("/robots.txt", initialOrigin).href,
      status: "UNAVAILABLE",
      applied: input.settings.respectRobotsTxt,
    },
    sitemap: {
      declaredUrls: [],
      processedUrls: [],
      pageUrls: [],
      pageUrlsDiscovered: 0,
      rejectedUrlCount: 0,
      truncated: false,
    },
    internalLinkUrlsDiscovered: 0,
  };
  let frontier: PendingUrl[] = [
    { url: startUrl, depth: 0, discoveredVia: "ROOT" },
  ];

  function addDiscoveredUrl(
    candidate: string,
    depth: number,
    discoveredVia: CrawlDiscoverySource,
    nextFrontier: PendingUrl[],
  ): boolean {
    if (
      discovered.size >= maximumDiscovered ||
      discovered.has(candidate) ||
      !isSafeCrawlDiscoveryUrl(candidate)
    ) {
      return false;
    }
    const url = new URL(candidate);
    const queryKey = `${url.origin}${url.pathname}`;
    const queryLimit = /(?:^|\/)(?:search|filter|results)(?:\/|$)/i.test(
      url.pathname,
    )
      ? maximumSearchVariantsPerPath
      : maximumQueryVariantsPerPath;
    if (url.search && (queryVariants.get(queryKey) ?? 0) >= queryLimit) {
      return false;
    }
    const datePath =
      /^(.*?)(?:\/(?:19|20)\d{2}\/\d{1,2}\/\d{1,2}|\/(?:19|20)\d{2}-\d{1,2}-\d{1,2})(?:\/|$)/.exec(
        url.pathname,
      );
    const dateKey = datePath ? `${url.origin}${datePath[1]}` : null;
    if (
      dateKey &&
      (datePathVariants.get(dateKey) ?? 0) >= maximumDatePathVariants
    ) {
      return false;
    }

    discovered.add(candidate);
    if (url.search) {
      queryVariants.set(queryKey, (queryVariants.get(queryKey) ?? 0) + 1);
    }
    if (dateKey) {
      datePathVariants.set(dateKey, (datePathVariants.get(dateKey) ?? 0) + 1);
    }
    nextFrontier.push({ url: candidate, depth, discoveredVia });
    return true;
  }

  for (
    let depth = 0;
    depth <= maximumDepth && frontier.length > 0;
    depth += 1
  ) {
    input.signal.throwIfAborted();
    const nextFrontier: PendingUrl[] = [];
    while (frontier.length > 0 && pages.length < maximumPages) {
      input.signal.throwIfAborted();
      const remaining = maximumPages - pages.length;
      const batch = frontier.splice(0, Math.min(concurrency, remaining));
      const processed = await Promise.all(
        batch.map((pending) => processUrl(pending, siteOrigin)),
      );

      for (const result of processed) {
        input.signal.throwIfAborted();
        if (pages.length >= maximumPages) break;
        const finalIdentity = result.page.normalizedUrl;
        if (completedIdentities.has(finalIdentity)) continue;
        completedIdentities.add(finalIdentity);
        discovered.add(finalIdentity);
        if (result.page.discoveredVia === "ROOT" && result.page.statusCode) {
          siteOrigin = new URL(result.page.url).origin;
          if (result.document) result.document.siteOrigin = siteOrigin;
        }
        pages.push(result.page);
        await input.callbacks?.onPage?.(result.page, result.document);

        if (
          result.page.discoveredVia === "ROOT" &&
          result.page.statusCode !== null &&
          result.page.statusCode >= 200 &&
          result.page.statusCode < 300 &&
          !sitemapDiscoveryCompleted
        ) {
          sitemapDiscoveryCompleted = true;
          let robots: RobotsPolicy | null = null;
          try {
            robots = await policyFor(siteOrigin);
            discovery.robots = {
              url: robots.robotsUrl,
              status: robots.status,
              applied: input.settings.respectRobotsTxt,
            };
          } catch (error) {
            if (input.signal.aborted) throw error;
            if (input.settings.respectRobotsTxt) throw error;
            discovery.robots = {
              url: new URL("/robots.txt", siteOrigin).href,
              status: "UNAVAILABLE",
              applied: false,
            };
          }

          const sitemap = await discoverSitemapPages({
            siteOrigin,
            declaredSitemaps: robots?.sitemapUrls ?? [],
            maximumPageUrls: maximumPages,
            signal: input.signal,
            fetchUrl: (url, options) =>
              dependencies.fetchUrl(url, {
                ...options,
                timeoutMs: Math.min(
                  options?.timeoutMs ?? 60_000,
                  clampInteger(
                    input.settings.requestTimeoutMs,
                    15_000,
                    1_000,
                    60_000,
                  ),
                ),
              }),
          });
          sitemapPageUrls = sitemap.pageUrls;
          discovery.sitemap = {
            declaredUrls: sitemap.declaredUrls,
            processedUrls: sitemap.processedUrls,
            pageUrls: sitemap.pageUrls,
            pageUrlsDiscovered: sitemap.pageUrls.length,
            rejectedUrlCount: sitemap.rejectedUrlCount,
            truncated: sitemap.truncated,
          };
          await input.callbacks?.onDiscovery?.(discovery);
        }

        await input.callbacks?.onProgress?.({
          pagesDiscovered: discovered.size,
          pagesCrawled: pages.length,
          currentUrl: result.page.url,
        });

        if (
          result.page.statusCode === null ||
          result.page.statusCode < 200 ||
          result.page.statusCode >= 300 ||
          result.document === null ||
          !result.page.followable ||
          result.page.depth >= maximumDepth ||
          !isSameOrigin(result.page.url, siteOrigin)
        ) {
          continue;
        }
        for (const link of result.page.internalLinks) {
          if (link.nofollow) continue;
          if (
            addDiscoveredUrl(
              link.normalizedUrl,
              result.page.depth + 1,
              "LINK",
              nextFrontier,
            )
          ) {
            internalLinkUrlsDiscovered += 1;
          }
        }
        if (result.page.discoveredVia === "ROOT") {
          for (const candidate of sitemapPageUrls) {
            if (discovered.size >= maximumDiscovered) break;
            try {
              const normalized = normalizeCrawlUrl(candidate);
              if (!isSameOrigin(normalized, siteOrigin)) continue;
              addDiscoveredUrl(normalized, 1, "SITEMAP", nextFrontier);
            } catch {
              // Invalid additional discovery URLs are not crawl destinations.
            }
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  const externalSources = new Map<string, Set<string>>();
  let externalCandidatesTruncated = false;
  input.signal.throwIfAborted();
  for (const page of pages) {
    for (const link of page.externalLinks) {
      if (!isSafePassiveRequestUrl(link.normalizedUrl)) continue;
      const existing = externalSources.get(link.normalizedUrl);
      if (
        !existing &&
        externalSources.size >= hardMaximumExternalCandidatesRetained
      ) {
        externalCandidatesTruncated = true;
        continue;
      }
      const sources = existing ?? new Set<string>();
      sources.add(page.normalizedUrl);
      externalSources.set(link.normalizedUrl, sources);
    }
  }
  const externalCandidates = [...externalSources]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, hardMaximumExternalLinkChecks);
  const externalResults: ExternalLinkCheck[] = [];
  if (input.settings.checkExternalLinks) {
    for (
      let offset = 0;
      offset < externalCandidates.length;
      offset += hardMaximumExternalCheckConcurrency
    ) {
      input.signal.throwIfAborted();
      const batch = externalCandidates.slice(
        offset,
        offset + hardMaximumExternalCheckConcurrency,
      );
      externalResults.push(
        ...(await Promise.all(
          batch.map(async ([url, sources]): Promise<ExternalLinkCheck> => {
            try {
              let response = await dependencies.fetchUrl(url, {
                signal: input.signal,
                method: "HEAD",
                timeoutMs: 10_000,
                maximumBodyBytes: 64 * 1024,
                maximumRedirects: 5,
                onRedirect(redirect) {
                  if (!isSafePassiveRequestUrl(redirect)) {
                    throw new CrawlUrlError(
                      "The external redirect is unsafe to check.",
                    );
                  }
                },
              });
              if (
                response.statusCode === 404 ||
                response.statusCode === 410 ||
                response.statusCode >= 500
              ) {
                response = await dependencies.fetchUrl(url, {
                  signal: input.signal,
                  method: "GET",
                  skipNonHtmlBody: true,
                  timeoutMs: 10_000,
                  maximumBodyBytes: 256 * 1024,
                  maximumRedirects: 5,
                  onRedirect(redirect) {
                    if (!isSafePassiveRequestUrl(redirect)) {
                      throw new CrawlUrlError(
                        "The external redirect is unsafe to check.",
                      );
                    }
                  },
                });
              }
              return {
                url,
                statusCode: response.statusCode,
                redirectCount: response.redirectCount,
                sourceUrls: [...sources].sort(),
                errorCode: null,
              };
            } catch (error) {
              if (input.signal.aborted) throw error;
              return {
                url,
                statusCode: null,
                redirectCount: 0,
                sourceUrls: [...sources].sort(),
                errorCode:
                  error instanceof SecureHttpError ? error.code : "UNKNOWN",
              };
            }
          }),
        )),
      );
    }
  }

  return {
    siteOrigin,
    pages,
    discoveredUrls: [...discovered],
    discovery: {
      ...discovery,
      internalLinkUrlsDiscovered,
    },
    externalLinkChecks: {
      enabled: input.settings.checkExternalLinks ?? false,
      candidateCount: externalSources.size,
      checkedCount: externalResults.length,
      truncated:
        externalCandidatesTruncated ||
        externalSources.size > hardMaximumExternalLinkChecks,
      results: externalResults,
    },
  };
}
