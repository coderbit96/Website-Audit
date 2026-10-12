import {
  AuditRuleCategory,
  AuditRuleSeverity,
  materializeAuditRuleResults,
  type AuditRuleDefinition,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

type SeoSeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const SEO_RULE_THRESHOLDS = Object.freeze({
  titleMinimumLength: 30,
  titleMaximumLength: 60,
  metaDescriptionMinimumLength: 70,
  metaDescriptionMaximumLength: 160,
  minimumInternalLinks: 2,
  maximumUrlLength: 115,
  maximumQueryParameters: 3,
  maximumEvidenceUrls: 25,
  maximumRetainedLinksPerPage: 1_000,
});

function defineSeoRule(input: {
  code: string;
  name: string;
  defaultSeverity: SeoSeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
  enabled?: boolean;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.SEO,
    enabled: input.enabled ?? true,
  });
}

export const SEO_RULE_DEFINITIONS = Object.freeze([
  defineSeoRule({
    code: "SEO_URL_TOO_LONG",
    name: "URL is unusually long",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The URL is longer than the audit's readability guideline.",
    recommendation:
      "Use a concise, descriptive URL where changing it will not disrupt existing links.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_URL_UNDERSCORES",
    name: "URL path contains underscores",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The URL path uses underscores between words.",
    recommendation: "Prefer hyphens for future human-readable URL slugs.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_URL_UPPERCASE",
    name: "URL path contains uppercase characters",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "The URL path contains uppercase characters that can create inconsistent variants.",
    recommendation: "Use lowercase URL paths and redirect old variants.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_URL_MANY_PARAMETERS",
    name: "URL contains many query parameters",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The URL contains more than three query parameters.",
    recommendation:
      "Remove tracking and nonessential parameters from indexable URLs.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_TITLE_MISSING",
    name: "Page title is missing",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description: "The page does not contain a non-empty title element.",
    recommendation: "Add a unique, descriptive title element in the head.",
    scoreWeight: 10,
  }),
  defineSeoRule({
    code: "SEO_TITLE_TOO_SHORT",
    name: "Page title is too short",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The title is shorter than the audit's editorial guideline.",
    recommendation:
      "Make the title more descriptive without adding filler or keyword repetition.",
    scoreWeight: 3,
  }),
  defineSeoRule({
    code: "SEO_TITLE_TOO_LONG",
    name: "Page title is too long",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The title is longer than the audit's editorial guideline.",
    recommendation:
      "Shorten the title while preserving its most useful and distinctive wording.",
    scoreWeight: 3,
  }),
  defineSeoRule({
    code: "SEO_META_DESCRIPTION_MISSING",
    name: "Meta description is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The page has no non-empty meta description.",
    recommendation:
      "Write a unique summary that accurately describes the page.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_META_DESCRIPTION_TOO_SHORT",
    name: "Meta description is too short",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The meta description is shorter than the audit guideline.",
    recommendation:
      "Add a useful summary of the page without padding it unnaturally.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_META_DESCRIPTION_TOO_LONG",
    name: "Meta description is too long",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The meta description is longer than the audit guideline.",
    recommendation:
      "Make the description concise while retaining the page's key information.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_H1_MISSING",
    name: "H1 heading is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "No H1 heading was found in the HTML.",
    recommendation: "Add one clear primary heading that describes the page.",
    scoreWeight: 5,
  }),
  defineSeoRule({
    code: "SEO_MULTIPLE_H1",
    name: "Page contains multiple H1 headings",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The page contains more than one H1 heading.",
    recommendation:
      "Confirm that one heading clearly represents the primary page topic.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_EMPTY_HEADINGS",
    name: "Page contains empty headings",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "One or more heading elements contain no readable text.",
    recommendation: "Remove empty headings or give them meaningful text.",
    scoreWeight: 4,
  }),
  defineSeoRule({
    code: "SEO_HEADING_HIERARCHY",
    name: "Heading levels are skipped",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The document outline skips one or more heading levels.",
    recommendation: "Use heading levels in a logical document outline.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_CANONICAL_MISSING",
    name: "Canonical link is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No canonical link element was found.",
    recommendation:
      "Consider declaring the preferred URL when duplicate variants can exist.",
    scoreWeight: 3,
  }),
  defineSeoRule({
    code: "SEO_CANONICAL_CONFLICT",
    name: "Canonical declarations conflict",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The page declares more than one distinct canonical target.",
    recommendation: "Declare exactly one unambiguous canonical URL.",
    scoreWeight: 7,
  }),
  defineSeoRule({
    code: "SEO_CANONICAL_INVALID",
    name: "Canonical URL is invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The canonical link does not resolve to an HTTP or HTTPS URL.",
    recommendation: "Use one absolute, valid HTTP or HTTPS canonical URL.",
    scoreWeight: 7,
  }),
  defineSeoRule({
    code: "SEO_CANONICAL_NOT_SELF_REFERENCING",
    name: "Canonical does not reference this page URL",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "The declared canonical points to a different URL.",
    recommendation:
      "Confirm that the target is the intended representative URL for this content.",
    scoreWeight: 3,
  }),
  defineSeoRule({
    code: "SEO_CANONICAL_ORIGIN_MISMATCH",
    name: "Canonical points to another origin",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The canonical URL uses a different origin from the audited page.",
    recommendation:
      "Verify that this cross-domain canonical is deliberate and controlled.",
    scoreWeight: 7,
  }),
  defineSeoRule({
    code: "SEO_META_NOINDEX",
    name: "Page is marked noindex",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Robots directives instruct search engines not to index this page.",
    recommendation:
      "Confirm that excluding this page from search results is intentional.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_NOFOLLOW",
    name: "Page is marked nofollow",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Robots directives instruct crawlers not to follow links on this page.",
    recommendation: "Confirm that suppressing link discovery is intentional.",
    scoreWeight: 5,
  }),
  defineSeoRule({
    code: "SEO_OG_TITLE_MISSING",
    name: "Open Graph title is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No non-empty og:title value was found.",
    recommendation:
      "Add accurate social-sharing metadata where sharing matters.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_OG_DESCRIPTION_MISSING",
    name: "Open Graph description is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No non-empty og:description value was found.",
    recommendation:
      "Add accurate social-sharing metadata where sharing matters.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_OG_IMAGE_MISSING",
    name: "Open Graph image is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No non-empty og:image value was found.",
    recommendation:
      "Add an appropriate social-sharing image where sharing matters.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_TWITTER_CARD_MISSING",
    name: "Twitter card metadata is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No twitter:card meta tag was found.",
    recommendation:
      "Add a supported card type if rich social previews are needed.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_SCHEMA_MISSING",
    name: "Schema markup was not detected",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description: "No JSON-LD, Microdata, or RDFa declaration was found.",
    recommendation:
      "Add relevant structured data only when it accurately represents visible content.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_STRUCTURED_DATA_INVALID",
    name: "Structured data could not be validated",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Structured data is invalid JSON or lacks a recognizable schema shape.",
    recommendation:
      "Correct the structured data and verify it with the relevant search-engine testing tool.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_HTML_LANG_MISSING",
    name: "HTML language attribute is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The root HTML element does not declare a language.",
    recommendation:
      "Add a valid BCP 47 language tag for browsers and assistive technology.",
    scoreWeight: 4,
  }),
  defineSeoRule({
    code: "SEO_LANGUAGE_INVALID",
    name: "HTML language attribute is invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The declared HTML language is not a valid BCP 47 language tag.",
    recommendation: "Use a valid BCP 47 language tag such as en or en-US.",
    scoreWeight: 4,
  }),
  defineSeoRule({
    code: "SEO_IMAGE_ALT_MISSING",
    name: "Images are missing alt attributes",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "One or more images do not declare an alt attribute.",
    recommendation:
      "Add meaningful alternative text, or an empty alt attribute for genuinely decorative images.",
    scoreWeight: 5,
  }),
  defineSeoRule({
    code: "SEO_EMPTY_ALT_REVIEW",
    name: "Images with empty alt text need review",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "One or more images use an empty alt attribute, which is correct only for decorative images.",
    recommendation:
      "Confirm each image is decorative; otherwise provide concise alternative text.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_ANCHOR_TEXT_EMPTY",
    name: "Links have no descriptive anchor text",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "One or more links have no text or accessible label.",
    recommendation: "Give navigational links concise, descriptive text.",
    scoreWeight: 4,
  }),
  defineSeoRule({
    code: "SEO_ANCHOR_TEXT_GENERIC",
    name: "Links use generic anchor text",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "One or more links use generic text that does not describe the destination.",
    recommendation: "Describe the destination or action in the link text.",
    scoreWeight: 2,
  }),
  defineSeoRule({
    code: "SEO_POOR_INTERNAL_LINKING",
    name: "Page has too few crawlable internal links",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The page has fewer crawlable internal links than the audit threshold.",
    recommendation:
      "Add useful links to related content and primary navigation.",
    scoreWeight: 5,
  }),
  defineSeoRule({
    code: "SEO_PAGINATION_PREVIOUS_MISSING",
    name: "Paginated URL has no previous-page link tag",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "The URL appears paginated, but the document has no rel=prev link.",
    recommendation:
      "Add a valid previous-page relationship when consumers require it.",
    scoreWeight: 1,
  }),
  defineSeoRule({
    code: "SEO_DUPLICATE_TITLE",
    name: "Duplicate page title",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The page title is shared by multiple crawled pages.",
    recommendation: "Write a distinct title that reflects this page's content.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_DUPLICATE_META_DESCRIPTION",
    name: "Duplicate meta description",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "The meta description is shared by multiple crawled pages.",
    recommendation:
      "Write a distinct description that reflects this page's content.",
    scoreWeight: 5,
  }),
  defineSeoRule({
    code: "SEO_ORPHAN_PAGE",
    name: "Sitemap page has no internal incoming links",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The page is listed in a sitemap but no crawled page links to it.",
    recommendation:
      "Add a relevant internal link or remove the URL from the sitemap if it should not be indexed.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_TRAILING_SLASH_INCONSISTENCY",
    name: "Trailing-slash URL variants are crawlable",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description: "Both slash and non-slash forms of the URL were found.",
    recommendation:
      "Choose one URL format and redirect plus canonicalize the alternate form.",
    scoreWeight: 6,
  }),
  defineSeoRule({
    code: "SEO_PAGINATION_TAGS_MISSING",
    name: "Pagination link relationships were not found",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Paginated URLs do not declare previous or next relationships.",
    recommendation:
      "Add pagination relationships when other consumers require them.",
    scoreWeight: 1,
  }),
]);

export function createSeoRuleResults(
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  return materializeAuditRuleResults(SEO_RULE_DEFINITIONS, matches);
}

export function createSeoRuleResult(match: AuditRuleMatch): AuditRuleResult {
  const result = createSeoRuleResults([match])[0];
  if (!result) {
    throw new Error(`Audit rule ${match.ruleCode} is disabled.`);
  }
  return result;
}
