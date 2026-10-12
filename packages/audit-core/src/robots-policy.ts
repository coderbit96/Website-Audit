import robotsParserPackage from "robots-parser";

import { AUDIT_USER_AGENT, secureFetchUrl } from "./secure-http.js";

const robotsUserAgent = AUDIT_USER_AGENT.split("/")[0] ?? "SiteSignalAuditBot";

type ParsedRobots = {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
  getCrawlDelay(userAgent?: string): number | undefined;
  getSitemaps(): string[];
};

const robotsParser = robotsParserPackage as unknown as (
  url: string,
  contents: string,
) => ParsedRobots;

export type RobotsPolicy = {
  robotsUrl: string;
  status: "FOUND" | "NOT_FOUND";
  isAllowed: (url: string | URL) => boolean;
  crawlDelayMs: number;
  sitemapUrls: readonly string[];
};

export function parseRobotsPolicy(
  robotsUrl: string | URL,
  contents: string,
  status: RobotsPolicy["status"] = "FOUND",
): RobotsPolicy {
  const normalizedRobotsUrl = new URL(robotsUrl).href;
  const robots = robotsParser(normalizedRobotsUrl, contents);
  const crawlDelaySeconds = robots.getCrawlDelay(robotsUserAgent);

  return {
    robotsUrl: normalizedRobotsUrl,
    status,
    isAllowed(url) {
      return robots.isAllowed(new URL(url).href, robotsUserAgent) !== false;
    },
    crawlDelayMs:
      typeof crawlDelaySeconds === "number" && crawlDelaySeconds > 0
        ? Math.min(Math.ceil(crawlDelaySeconds * 1_000), 10_000)
        : 0,
    sitemapUrls: robots.getSitemaps(),
  };
}

export async function loadRobotsPolicy(
  origin: string | URL,
  options: { signal?: AbortSignal } = {},
): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", new URL(origin).origin);
  const response = await secureFetchUrl(robotsUrl, {
    ...(options.signal ? { signal: options.signal } : {}),
    maximumBodyBytes: 512 * 1024,
  });

  if (response.statusCode === 404 || response.statusCode === 410) {
    return parseRobotsPolicy(robotsUrl, "", "NOT_FOUND");
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `robots.txt returned HTTP ${response.statusCode}; crawling was not started.`,
    );
  }

  return parseRobotsPolicy(robotsUrl, response.body.toString("utf8"));
}
