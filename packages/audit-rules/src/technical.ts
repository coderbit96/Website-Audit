import {
  sortAuditRuleResults,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

import {
  TECHNICAL_RULE_THRESHOLDS,
  createTechnicalRuleResults,
} from "./technical-rules.js";

export type TechnicalRedirectHop = {
  sourceUrl: string;
  statusCode: number;
  destinationUrl: string;
};

export type TechnicalLink = { url: string };

export type TechnicalPageInput = {
  requestedUrl: string;
  url: string;
  normalizedUrl: string;
  statusCode: number | null;
  redirectCount: number;
  redirectChain: readonly TechnicalRedirectHop[];
  fetchErrorCode: string | null;
  depth: number;
  responseTimeMs: number | null;
  pageSizeBytes: number;
  contentType: string | null;
  indexable: boolean;
  robotsDirectives: readonly string[];
  canonical: string | null;
  canonicalDeclarations: readonly string[];
  internalLinks: readonly TechnicalLink[];
  mixedContentResources: readonly { url: string; type: string }[];
  mixedContentResourceCount: number;
};

export type TechnicalExternalLinkCheck = {
  url: string;
  statusCode: number | null;
  sourceUrls: readonly string[];
  errorCode: string | null;
};

export type TechnicalAuditInput = {
  pages: readonly TechnicalPageInput[];
  sitemap: {
    declaredUrls: readonly string[];
    processedUrls: readonly string[];
    rejectedUrlCount: number;
  };
  externalLinkChecks: {
    enabled: boolean;
    candidateCount: number;
    checkedCount: number;
    truncated: boolean;
    results: readonly TechnicalExternalLinkCheck[];
  };
};

export type TechnicalSiteReport = {
  findings: AuditRuleResult[];
  metrics: ReadonlyArray<{
    category: "TECHNICAL";
    key: string;
    value: number;
    unit: string;
  }>;
};

type EvidenceEntry = Readonly<Record<string, unknown>> & { url: string };

function pathSegmentCount(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

function isSuccessfulHtmlPage(page: TechnicalPageInput): boolean {
  return (
    page.statusCode !== null &&
    page.statusCode >= 200 &&
    page.statusCode < 300 &&
    (page.contentType?.includes("html") ?? false)
  );
}

function isBrokenInternalStatus(statusCode: number | null): boolean {
  return statusCode !== null && statusCode >= 400;
}

function isDefinitivelyBrokenExternalStatus(
  statusCode: number | null,
): boolean {
  return statusCode === 404 || statusCode === 410 || (statusCode ?? 0) >= 500;
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function aggregateMatch(input: {
  ruleCode: string;
  entries: readonly EvidenceEntry[];
  title?: string;
  description?: string;
  recommendation?: string;
  extraEvidence?: Readonly<Record<string, unknown>>;
}): AuditRuleMatch | null {
  if (input.entries.length === 0) return null;
  const sorted = [...input.entries].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  const affectedUrls = distinctSorted(sorted.map((entry) => entry.url));
  return {
    ruleCode: input.ruleCode,
    affectedUrl: affectedUrls.length === 1 ? (affectedUrls[0] ?? null) : null,
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.recommendation ? { recommendation: input.recommendation } : {}),
    occurrences: input.entries.length,
    evidence: {
      totalOccurrences: input.entries.length,
      affectedUrlCount: affectedUrls.length,
      affectedUrls: affectedUrls.slice(
        0,
        TECHNICAL_RULE_THRESHOLDS.maximumEvidenceUrls,
      ),
      details: sorted.slice(0, TECHNICAL_RULE_THRESHOLDS.maximumEvidenceUrls),
      evidenceTruncated:
        sorted.length > TECHNICAL_RULE_THRESHOLDS.maximumEvidenceUrls,
      ...input.extraEvidence,
    },
  };
}

function canonicalConflicts(
  page: TechnicalPageInput,
  pagesByUrl: ReadonlyMap<string, TechnicalPageInput>,
): EvidenceEntry | null {
  const declarations = distinctSorted(page.canonicalDeclarations);
  if (declarations.length > 1) {
    return {
      url: page.url,
      reason: "MULTIPLE_TARGETS",
      canonicalTargets: declarations,
    };
  }
  if (!page.canonical) return null;
  const target = pagesByUrl.get(page.canonical);
  if (!target) return null;
  if (
    target.statusCode === null ||
    target.statusCode < 200 ||
    target.statusCode >= 300
  ) {
    return {
      url: page.url,
      reason: "UNHEALTHY_TARGET",
      canonicalTarget: page.canonical,
      targetStatusCode: target.statusCode,
    };
  }
  if (!target.indexable) {
    return {
      url: page.url,
      reason: "NON_INDEXABLE_TARGET",
      canonicalTarget: page.canonical,
    };
  }
  return null;
}

export function analyzeTechnicalSite(
  input: TechnicalAuditInput,
): TechnicalSiteReport {
  const pagesByUrl = new Map(
    input.pages.flatMap((page) => [
      [page.normalizedUrl, page] as const,
      [page.url, page] as const,
    ]),
  );
  const linkedInternalUrls = new Map<string, Set<string>>();
  for (const page of input.pages) {
    for (const link of page.internalLinks) {
      const sources = linkedInternalUrls.get(link.url) ?? new Set<string>();
      sources.add(page.url);
      linkedInternalUrls.set(link.url, sources);
    }
  }

  const brokenInternal: EvidenceEntry[] = [];
  for (const [targetUrl, sourceUrls] of linkedInternalUrls) {
    const target = pagesByUrl.get(targetUrl);
    if (!target || !isBrokenInternalStatus(target.statusCode)) continue;
    const sortedSources = [...sourceUrls].sort();
    brokenInternal.push({
      url: targetUrl,
      statusCode: target.statusCode,
      sourceCount: sortedSources.length,
      sourceUrls: sortedSources.slice(
        0,
        TECHNICAL_RULE_THRESHOLDS.maximumRelatedUrlsPerEvidence,
      ),
      sourceEvidenceTruncated:
        sortedSources.length >
        TECHNICAL_RULE_THRESHOLDS.maximumRelatedUrlsPerEvidence,
    });
  }
  const brokenExternal = input.externalLinkChecks.results
    .filter((check) => isDefinitivelyBrokenExternalStatus(check.statusCode))
    .map((check): EvidenceEntry => {
      const sourceUrls = distinctSorted(check.sourceUrls);
      return {
        url: check.url,
        statusCode: check.statusCode,
        sourceCount: sourceUrls.length,
        sourceUrls: sourceUrls.slice(
          0,
          TECHNICAL_RULE_THRESHOLDS.maximumRelatedUrlsPerEvidence,
        ),
        sourceEvidenceTruncated:
          sourceUrls.length >
          TECHNICAL_RULE_THRESHOLDS.maximumRelatedUrlsPerEvidence,
      };
    });

  const matches: Array<AuditRuleMatch | null> = [
    aggregateMatch({
      ruleCode: "TECH_BROKEN_INTERNAL_LINK",
      entries: brokenInternal,
    }),
    aggregateMatch({
      ruleCode: "TECH_BROKEN_EXTERNAL_LINK",
      entries: brokenExternal,
      extraEvidence: {
        checkedCount: input.externalLinkChecks.checkedCount,
        candidateCount: input.externalLinkChecks.candidateCount,
        checksTruncated: input.externalLinkChecks.truncated,
      },
    }),
    aggregateMatch({
      ruleCode: "TECH_REDIRECT",
      entries: input.pages
        .filter((page) => page.redirectCount > 0)
        .map((page) => ({
          url: page.requestedUrl,
          finalUrl: page.url,
          redirectCount: page.redirectCount,
        })),
    }),
    aggregateMatch({
      ruleCode: "TECH_REDIRECT_CHAIN",
      entries: input.pages
        .filter(
          (page) =>
            page.redirectCount >=
            TECHNICAL_RULE_THRESHOLDS.redirectChainMinimumHops,
        )
        .map((page) => ({
          url: page.requestedUrl,
          finalUrl: page.url,
          redirectCount: page.redirectCount,
          redirectChain: page.redirectChain,
        })),
    }),
    aggregateMatch({
      ruleCode: "TECH_REDIRECT_LOOP",
      entries: input.pages
        .filter((page) => page.fetchErrorCode === "REDIRECT_LOOP")
        .map((page) => ({
          url: page.requestedUrl,
          redirectChain: page.redirectChain,
        })),
    }),
    aggregateMatch({
      ruleCode: "TECH_HTTP_URL",
      entries: input.pages
        .filter((page) => isHttpUrl(page.requestedUrl) || isHttpUrl(page.url))
        .map((page) => ({
          url: isHttpUrl(page.requestedUrl) ? page.requestedUrl : page.url,
          requestedUrl: page.requestedUrl,
          finalUrl: page.url,
        })),
    }),
    aggregateMatch({
      ruleCode: "TECH_404",
      entries: input.pages
        .filter((page) => page.statusCode === 404)
        .map((page) => ({ url: page.url, statusCode: 404 })),
    }),
    aggregateMatch({
      ruleCode: "TECH_SERVER_ERROR",
      entries: input.pages
        .filter((page) => (page.statusCode ?? 0) >= 500)
        .map((page) => ({ url: page.url, statusCode: page.statusCode })),
    }),
    aggregateMatch({
      ruleCode: "TECH_ROBOTS_BLOCKED",
      entries: input.pages
        .filter((page) => page.fetchErrorCode === "ROBOTS_DENIED")
        .map((page) => ({ url: page.url })),
    }),
    input.sitemap.processedUrls.length === 0
      ? {
          ruleCode: "TECH_SITEMAP_MISSING",
          affectedUrl: null,
          evidence: {
            declaredSitemaps: input.sitemap.declaredUrls,
            processedSitemaps: input.sitemap.processedUrls,
            rejectedSitemapCount: input.sitemap.rejectedUrlCount,
          },
        }
      : null,
    aggregateMatch({
      ruleCode: "TECH_URL_TOO_DEEP",
      entries: input.pages
        .map((page) => ({
          url: page.url,
          pathSegments: pathSegmentCount(page.url),
        }))
        .filter(
          (page) =>
            page.pathSegments >
            TECHNICAL_RULE_THRESHOLDS.maximumUrlPathSegments,
        ),
      extraEvidence: {
        maximumPathSegments: TECHNICAL_RULE_THRESHOLDS.maximumUrlPathSegments,
      },
    }),
    aggregateMatch({
      ruleCode: "TECH_CANONICAL_CONFLICT",
      entries: input.pages.flatMap((page) => {
        const conflict = canonicalConflicts(page, pagesByUrl);
        return conflict ? [conflict] : [];
      }),
    }),
    aggregateMatch({
      ruleCode: "TECH_MIXED_CONTENT",
      entries: input.pages
        .filter((page) => page.mixedContentResourceCount > 0)
        .map((page) => ({
          url: page.url,
          resourceCount: page.mixedContentResourceCount,
          resources: page.mixedContentResources.slice(
            0,
            TECHNICAL_RULE_THRESHOLDS.maximumResourcesPerPageEvidence,
          ),
          resourceEvidenceTruncated:
            page.mixedContentResources.length >
            TECHNICAL_RULE_THRESHOLDS.maximumResourcesPerPageEvidence,
        })),
    }),
    aggregateMatch({
      ruleCode: "TECH_SLOW_RESPONSE",
      entries: input.pages
        .filter(
          (page) =>
            page.responseTimeMs !== null &&
            page.responseTimeMs >
              TECHNICAL_RULE_THRESHOLDS.slowResponseMilliseconds,
        )
        .map((page) => ({
          url: page.url,
          responseTimeMs: page.responseTimeMs,
        })),
      extraEvidence: {
        thresholdMs: TECHNICAL_RULE_THRESHOLDS.slowResponseMilliseconds,
      },
    }),
    aggregateMatch({
      ruleCode: "TECH_LARGE_PAGE",
      entries: input.pages
        .filter(
          (page) =>
            page.pageSizeBytes > TECHNICAL_RULE_THRESHOLDS.largePageBytes,
        )
        .map((page) => ({
          url: page.url,
          pageSizeBytes: page.pageSizeBytes,
        })),
      extraEvidence: {
        thresholdBytes: TECHNICAL_RULE_THRESHOLDS.largePageBytes,
      },
    }),
    aggregateMatch({
      ruleCode: "TECH_INDEXABILITY",
      entries: input.pages
        .filter((page) => isSuccessfulHtmlPage(page) && !page.indexable)
        .map((page) => ({
          url: page.url,
          robotsDirectives: page.robotsDirectives,
        })),
    }),
  ];

  const findings = createTechnicalRuleResults(
    matches.filter((match): match is AuditRuleMatch => match !== null),
  );
  return {
    findings: sortAuditRuleResults(findings),
    metrics: [
      {
        category: "TECHNICAL",
        key: "technical.findings",
        value: findings.length,
        unit: "findings",
      },
      {
        category: "TECHNICAL",
        key: "technical.external_links_checked",
        value: input.externalLinkChecks.checkedCount,
        unit: "links",
      },
      {
        category: "TECHNICAL",
        key: "technical.broken_internal_links",
        value: brokenInternal.length,
        unit: "links",
      },
      {
        category: "TECHNICAL",
        key: "technical.broken_external_links",
        value: brokenExternal.length,
        unit: "links",
      },
    ],
  };
}
