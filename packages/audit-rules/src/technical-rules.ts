import {
  AuditRuleCategory,
  AuditRuleSeverity,
  materializeAuditRuleResults,
  type AuditRuleDefinition,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

type TechnicalSeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const TECHNICAL_RULE_THRESHOLDS = Object.freeze({
  redirectChainMinimumHops: 2,
  maximumUrlPathSegments: 4,
  slowResponseMilliseconds: 1_000,
  largePageBytes: 1_000_000,
  maximumEvidenceUrls: 100,
  maximumRelatedUrlsPerEvidence: 25,
  maximumResourcesPerPageEvidence: 25,
});

function defineTechnicalRule(input: {
  code: string;
  name: string;
  defaultSeverity: TechnicalSeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.TECHNICAL,
    enabled: true,
  });
}

export const TECHNICAL_RULE_DEFINITIONS = Object.freeze([
  defineTechnicalRule({
    code: "TECH_BROKEN_INTERNAL_LINK",
    name: "Broken internal links",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description:
      "Internal links point to destinations that returned a broken HTTP status.",
    recommendation:
      "Correct or remove each broken internal link and restore pages that should exist.",
    scoreWeight: 10,
  }),
  defineTechnicalRule({
    code: "TECH_BROKEN_EXTERNAL_LINK",
    name: "Broken external links",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Checked external links point to destinations with a definitive broken response.",
    recommendation:
      "Update, replace, or remove links to unavailable external resources.",
    scoreWeight: 5,
  }),
  defineTechnicalRule({
    code: "TECH_REDIRECT",
    name: "Redirecting URLs",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Requested URLs redirect before reaching their final destination.",
    recommendation:
      "Update internal links to use final destination URLs directly where practical.",
    scoreWeight: 2,
  }),
  defineTechnicalRule({
    code: "TECH_REDIRECT_CHAIN",
    name: "Redirect chains",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "Requested URLs require two or more redirect hops.",
    recommendation:
      "Replace redirect chains with a single redirect to the final destination.",
    scoreWeight: 6,
  }),
  defineTechnicalRule({
    code: "TECH_REDIRECT_LOOP",
    name: "Redirect loops",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description: "One or more requested URLs entered a redirect loop.",
    recommendation:
      "Correct the redirect rules so every URL reaches a stable destination.",
    scoreWeight: 10,
  }),
  defineTechnicalRule({
    code: "TECH_HTTP_URL",
    name: "Insecure HTTP URLs",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "Crawled URLs use unencrypted HTTP.",
    recommendation:
      "Serve the site over HTTPS and redirect HTTP URLs directly to their HTTPS equivalents.",
    scoreWeight: 8,
  }),
  defineTechnicalRule({
    code: "TECH_404",
    name: "Pages return HTTP 404",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description: "Crawled pages returned HTTP 404 Not Found.",
    recommendation:
      "Restore the missing pages or update links to valid destinations.",
    scoreWeight: 10,
  }),
  defineTechnicalRule({
    code: "TECH_SERVER_ERROR",
    name: "Server errors",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description: "Crawled pages returned an HTTP 5xx server error.",
    recommendation:
      "Investigate application and infrastructure logs and restore a successful response.",
    scoreWeight: 10,
  }),
  defineTechnicalRule({
    code: "TECH_ROBOTS_BLOCKED",
    name: "URLs blocked by robots.txt",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Discovered URLs could not be crawled because robots.txt disallows them.",
    recommendation:
      "Confirm that each blocked URL should be excluded or update the relevant robots.txt rule.",
    scoreWeight: 5,
  }),
  defineTechnicalRule({
    code: "TECH_SITEMAP_MISSING",
    name: "XML sitemap not found",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "No usable XML sitemap document was discovered.",
    recommendation: "Publish an XML sitemap and reference it from robots.txt.",
    scoreWeight: 5,
  }),
  defineTechnicalRule({
    code: "TECH_URL_TOO_DEEP",
    name: "Deep URL paths",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "URL paths contain more segments than the technical audit guideline.",
    recommendation:
      "Use a shallower, understandable information hierarchy where it benefits users.",
    scoreWeight: 2,
  }),
  defineTechnicalRule({
    code: "TECH_CANONICAL_CONFLICT",
    name: "Technical canonical conflicts",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Canonical declarations conflict or point to an unhealthy crawled destination.",
    recommendation:
      "Declare one valid canonical URL that resolves successfully and is indexable.",
    scoreWeight: 7,
  }),
  defineTechnicalRule({
    code: "TECH_MIXED_CONTENT",
    name: "Mixed-content resources",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description:
      "HTTPS pages request one or more resources over insecure HTTP.",
    recommendation:
      "Load every page resource through HTTPS and remove insecure resource references.",
    scoreWeight: 9,
  }),
  defineTechnicalRule({
    code: "TECH_SLOW_RESPONSE",
    name: "Slow server responses",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Page responses exceed the technical audit response-time threshold.",
    recommendation:
      "Reduce server processing time, network latency, and avoidable redirect overhead.",
    scoreWeight: 6,
  }),
  defineTechnicalRule({
    code: "TECH_LARGE_PAGE",
    name: "Large HTML responses",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "HTML responses exceed the technical audit size threshold.",
    recommendation:
      "Reduce unnecessary markup and inline payloads, and compress responses appropriately.",
    scoreWeight: 5,
  }),
  defineTechnicalRule({
    code: "TECH_INDEXABILITY",
    name: "Non-indexable successful pages",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Successful HTML pages contain directives that prevent indexing.",
    recommendation:
      "Confirm the exclusion is intentional or remove the blocking robots directive.",
    scoreWeight: 6,
  }),
]);

export function createTechnicalRuleResults(
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  return materializeAuditRuleResults(TECHNICAL_RULE_DEFINITIONS, matches);
}
