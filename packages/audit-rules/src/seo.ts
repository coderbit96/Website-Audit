import {
  sortAuditRuleResults,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";
import { load } from "cheerio";

import { SEO_RULE_THRESHOLDS, createSeoRuleResult } from "./seo-rules.js";

export type SeoFindingDraft = AuditRuleResult;

export type SeoLink = {
  url: string;
  text: string;
  internal: boolean;
  nofollow: boolean;
};

export type SeoPageInput = {
  requestedUrl: string;
  finalUrl: string;
  siteOrigin: string;
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  html: string;
  depth: number;
  loadTimeMs: number;
  discoveredVia: "ROOT" | "LINK" | "SITEMAP";
};

export type SeoPageReport = {
  requestedUrl: string;
  url: string;
  normalizedUrl: string;
  statusCode: number;
  depth: number;
  loadTimeMs: number;
  discoveredVia: SeoPageInput["discoveredVia"];
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  noindex: boolean;
  nofollow: boolean;
  headingCount: number;
  h1Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  links: SeoLink[];
  linksTruncated?: boolean;
  pagination: { previous: string | null; next: string | null };
  findings: SeoFindingDraft[];
};

export type SeoSiteReport = {
  findings: SeoFindingDraft[];
  metrics: ReadonlyArray<{ key: string; value: number; unit?: string }>;
};

export type SitemapDocument = {
  type: "urlset" | "index" | "unknown";
  locations: string[];
};

const genericAnchorTexts = new Set([
  "click here",
  "here",
  "learn more",
  "more",
  "read more",
  "view",
  "details",
]);

function compactText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function comparableUrl(value: string | URL): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

function resolveHttpUrl(
  value: string | undefined,
  baseUrl: string,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function addFinding(
  findings: SeoFindingDraft[],
  affectedUrl: string | null,
  finding: Omit<AuditRuleMatch, "affectedUrl">,
): void {
  findings.push(createSeoRuleResult({ affectedUrl, ...finding }));
}

function analyzeUrlStructure(url: URL, findings: SeoFindingDraft[]): void {
  if (url.href.length > SEO_RULE_THRESHOLDS.maximumUrlLength) {
    addFinding(findings, url.href, {
      ruleCode: "SEO_URL_TOO_LONG",
      severity: "RECOMMENDATION",
      title: "URL is unusually long",
      description: `This URL contains ${url.href.length} characters.`,
      recommendation:
        "Use a concise, descriptive URL where changing it will not disrupt existing links.",
      evidence: { length: url.href.length },
    });
  }
  if (url.pathname.includes("_")) {
    addFinding(findings, url.href, {
      ruleCode: "SEO_URL_UNDERSCORES",
      severity: "RECOMMENDATION",
      title: "URL path contains underscores",
      description: "Hyphen-separated words are generally easier to read.",
      recommendation: "Prefer hyphens for future human-readable URL slugs.",
      evidence: { pathname: url.pathname },
    });
  }
  if (/[A-Z]/.test(url.pathname)) {
    addFinding(findings, url.href, {
      ruleCode: "SEO_URL_UPPERCASE",
      severity: "RECOMMENDATION",
      title: "URL path contains uppercase characters",
      description: "Mixed-case URLs can create inconsistent link variants.",
      recommendation: "Use lowercase URL paths and redirect old variants.",
      evidence: { pathname: url.pathname },
    });
  }
  if (
    [...url.searchParams].length > SEO_RULE_THRESHOLDS.maximumQueryParameters
  ) {
    addFinding(findings, url.href, {
      ruleCode: "SEO_URL_MANY_PARAMETERS",
      severity: "RECOMMENDATION",
      title: "URL contains many query parameters",
      description: "The URL has more than three query parameters.",
      recommendation:
        "Remove tracking and nonessential parameters from indexable URLs.",
      evidence: { parameterCount: [...url.searchParams].length },
    });
  }
}

function parseRobotsDirectives(
  metaContents: string[],
  xRobotsTag: string | undefined,
): Set<string> {
  const directives = new Set<string>();
  const allValues = [...metaContents, ...(xRobotsTag ? [xRobotsTag] : [])];
  for (const value of allValues) {
    for (const directive of value.toLowerCase().split(/[\s,]+/)) {
      const normalized = directive.replace(/^googlebot:/, "").trim();
      if (normalized) directives.add(normalized);
    }
  }
  if (directives.has("none")) {
    directives.add("noindex");
    directives.add("nofollow");
  }
  return directives;
}

function isValidLanguageTag(language: string): boolean {
  try {
    return Intl.getCanonicalLocales(language).length === 1;
  } catch {
    return false;
  }
}

export function analyzeSeoPage(input: SeoPageInput): SeoPageReport {
  const $ = load(input.html);
  const finalUrl = new URL(input.finalUrl);
  const findings: SeoFindingDraft[] = [];
  const titleElementCount = $("head > title").length;
  const title = compactText($("head > title").first().text()) || null;
  const metaDescriptionElements = $("meta").filter(
    (_index, element) =>
      ($(element).attr("name") ?? "").toLowerCase() === "description",
  );
  const metaDescription =
    compactText(metaDescriptionElements.first().attr("content")) || null;

  if (!title) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_TITLE_MISSING",
      severity: "CRITICAL",
      title: "Page title is missing",
      description: "The page does not contain a non-empty title element.",
      recommendation: "Add a unique, descriptive title element in the head.",
      affectedElement: "title",
      evidence: { titleElementCount, title: null },
    });
  } else if (title.length < SEO_RULE_THRESHOLDS.titleMinimumLength) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_TITLE_TOO_SHORT",
      severity: "RECOMMENDATION",
      title: "Page title is too short",
      description: `The title contains ${title.length} characters; the audit review threshold is at least ${SEO_RULE_THRESHOLDS.titleMinimumLength}.`,
      recommendation:
        "Make the title more descriptive without adding filler or keyword repetition.",
      affectedElement: "title",
      evidence: {
        actualLength: title.length,
        minimumLength: SEO_RULE_THRESHOLDS.titleMinimumLength,
        title,
      },
    });
  } else if (title.length > SEO_RULE_THRESHOLDS.titleMaximumLength) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_TITLE_TOO_LONG",
      severity: "RECOMMENDATION",
      title: "Page title is too long",
      description: `The title contains ${title.length} characters; the audit review threshold is at most ${SEO_RULE_THRESHOLDS.titleMaximumLength}.`,
      recommendation:
        "Shorten the title while preserving its most useful and distinctive wording.",
      affectedElement: "title",
      evidence: {
        actualLength: title.length,
        maximumLength: SEO_RULE_THRESHOLDS.titleMaximumLength,
        title,
      },
    });
  }

  if (!metaDescription) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_META_DESCRIPTION_MISSING",
      severity: "WARNING",
      title: "Meta description is missing",
      description: "The page has no non-empty meta description.",
      recommendation:
        "Write a unique summary that accurately describes the page.",
      affectedElement: 'meta[name="description"]',
      evidence: {
        metaDescriptionElementCount: metaDescriptionElements.length,
        description: null,
      },
    });
  } else if (
    metaDescription.length < SEO_RULE_THRESHOLDS.metaDescriptionMinimumLength
  ) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_META_DESCRIPTION_TOO_SHORT",
      severity: "RECOMMENDATION",
      title: "Meta description is too short",
      description: `The description contains ${metaDescription.length} characters; the audit review threshold is at least ${SEO_RULE_THRESHOLDS.metaDescriptionMinimumLength}.`,
      recommendation:
        "Add a useful summary of the page without padding it unnaturally.",
      affectedElement: 'meta[name="description"]',
      evidence: {
        actualLength: metaDescription.length,
        minimumLength: SEO_RULE_THRESHOLDS.metaDescriptionMinimumLength,
        description: metaDescription,
      },
    });
  } else if (
    metaDescription.length > SEO_RULE_THRESHOLDS.metaDescriptionMaximumLength
  ) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_META_DESCRIPTION_TOO_LONG",
      severity: "RECOMMENDATION",
      title: "Meta description is too long",
      description: `The description contains ${metaDescription.length} characters; the audit review threshold is at most ${SEO_RULE_THRESHOLDS.metaDescriptionMaximumLength}.`,
      recommendation:
        "Make the description concise while retaining the page's key information.",
      affectedElement: 'meta[name="description"]',
      evidence: {
        actualLength: metaDescription.length,
        maximumLength: SEO_RULE_THRESHOLDS.metaDescriptionMaximumLength,
        description: metaDescription,
      },
    });
  }

  const headings = $("h1, h2, h3, h4, h5, h6").toArray();
  const h1Count = $("h1").length;
  if (h1Count === 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_H1_MISSING",
      severity: "WARNING",
      title: "H1 heading is missing",
      description: "No H1 heading was found in the HTML.",
      recommendation: "Add one clear primary heading that describes the page.",
      affectedElement: "h1",
      evidence: { h1Count: 0 },
    });
  } else if (h1Count > 1) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_MULTIPLE_H1",
      severity: "RECOMMENDATION",
      title: "Page contains multiple H1 headings",
      description: `${h1Count} H1 headings were found.`,
      recommendation:
        "Confirm that one heading clearly represents the primary page topic.",
      affectedElement: "h1",
      evidence: {
        h1Count,
        headings: $("h1")
          .toArray()
          .map((heading) => compactText($(heading).text()))
          .slice(0, SEO_RULE_THRESHOLDS.maximumEvidenceUrls),
      },
      occurrences: h1Count,
    });
  }

  const emptyHeadings = headings.filter(
    (heading) => compactText($(heading).text()).length === 0,
  );
  if (emptyHeadings.length > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_EMPTY_HEADINGS",
      severity: "WARNING",
      title: "Page contains empty headings",
      description: `${emptyHeadings.length} heading elements contain no readable text.`,
      recommendation: "Remove empty headings or give them meaningful text.",
      affectedElement: "h1, h2, h3, h4, h5, h6",
      evidence: { count: emptyHeadings.length },
      occurrences: emptyHeadings.length,
    });
  }

  let previousHeadingLevel: number | null = null;
  const headingJumps: Array<{ from: number; to: number; text: string }> = [];
  for (const heading of headings) {
    if (!compactText($(heading).text())) continue;
    const level = Number(heading.tagName.slice(1));
    if (previousHeadingLevel !== null && level > previousHeadingLevel + 1) {
      headingJumps.push({
        from: previousHeadingLevel,
        to: level,
        text: compactText($(heading).text()),
      });
    }
    previousHeadingLevel = level;
  }
  if (headingJumps.length > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_HEADING_HIERARCHY",
      severity: "RECOMMENDATION",
      title: "Heading levels are skipped",
      description: `${headingJumps.length} heading transitions skip one or more levels.`,
      recommendation: "Use heading levels in a logical document outline.",
      affectedElement: "h1, h2, h3, h4, h5, h6",
      evidence: { jumps: headingJumps },
      occurrences: headingJumps.length,
    });
  }

  const canonicalElements = $("link")
    .filter((_index, element) =>
      ($(element).attr("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("canonical"),
    )
    .toArray();
  const canonicalDeclarations = canonicalElements
    .map((element) => compactText($(element).attr("href")))
    .filter(Boolean);
  const canonicalTargets = [
    ...new Set(
      canonicalDeclarations.map(
        (value) => resolveHttpUrl(value, finalUrl.href) ?? value,
      ),
    ),
  ];
  const rawCanonical = $(canonicalElements[0]).attr("href");
  const canonicalUrl = resolveHttpUrl(rawCanonical, finalUrl.href);
  if (canonicalElements.length === 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_CANONICAL_MISSING",
      severity: "RECOMMENDATION",
      title: "Canonical link is missing",
      description: "No canonical link element was found.",
      recommendation:
        "Consider declaring the preferred URL when duplicate variants can exist.",
      affectedElement: 'link[rel="canonical"]',
      evidence: { canonicalCount: 0, canonicalTargets: [] },
    });
  } else if (canonicalTargets.length > 1) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_CANONICAL_CONFLICT",
      severity: "WARNING",
      title: "Canonical declarations conflict",
      description: `${canonicalTargets.length} distinct canonical targets were found.`,
      recommendation: "Declare exactly one unambiguous canonical URL.",
      affectedElement: 'link[rel="canonical"]',
      evidence: {
        canonicalElementCount: canonicalElements.length,
        canonicalTargets,
      },
      occurrences: canonicalTargets.length,
    });
  }
  if (rawCanonical && !canonicalUrl) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_CANONICAL_INVALID",
      severity: "WARNING",
      title: "Canonical URL is invalid",
      description:
        "The canonical link does not resolve to an HTTP or HTTPS URL.",
      recommendation: "Use one absolute, valid HTTP or HTTPS canonical URL.",
      affectedElement: 'link[rel="canonical"]',
      evidence: { value: rawCanonical },
    });
  } else if (canonicalUrl) {
    if (comparableUrl(canonicalUrl) !== comparableUrl(finalUrl)) {
      addFinding(findings, finalUrl.href, {
        ruleCode: "SEO_CANONICAL_NOT_SELF_REFERENCING",
        severity: "RECOMMENDATION",
        title: "Canonical does not reference this page URL",
        description: "The declared canonical points to a different URL.",
        recommendation:
          "Confirm that the target is the intended representative URL for this content.",
        affectedElement: 'link[rel="canonical"]',
        evidence: { pageUrl: finalUrl.href, canonicalUrl },
      });
    }
    if (new URL(canonicalUrl).origin !== finalUrl.origin) {
      addFinding(findings, finalUrl.href, {
        ruleCode: "SEO_CANONICAL_ORIGIN_MISMATCH",
        severity: "WARNING",
        title: "Canonical points to another origin",
        description:
          "The canonical URL uses a different origin from the audited page.",
        recommendation:
          "Verify that this cross-domain canonical is deliberate and controlled.",
        affectedElement: 'link[rel="canonical"]',
        evidence: { pageOrigin: finalUrl.origin, canonicalUrl },
      });
    }
  }

  const robotsMetaContents = $("meta")
    .filter((_index, element) => {
      const name = ($(element).attr("name") ?? "").toLowerCase();
      return name === "robots" || name === "googlebot";
    })
    .map((_index, element) => $(element).attr("content") ?? "")
    .get();
  const robotsDirectives = parseRobotsDirectives(
    robotsMetaContents,
    input.headers["x-robots-tag"],
  );
  const noindex = robotsDirectives.has("noindex");
  const nofollow = robotsDirectives.has("nofollow");
  if (noindex) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_META_NOINDEX",
      severity: "WARNING",
      title: "Page is marked noindex",
      description:
        "A robots directive asks search engines not to index this page.",
      recommendation:
        "Confirm that excluding this page from search is intentional.",
      affectedElement:
        'meta[name="robots"], meta[name="googlebot"], X-Robots-Tag',
      evidence: {
        directives: [...robotsDirectives],
        metaContents: robotsMetaContents,
        xRobotsTag: input.headers["x-robots-tag"] ?? null,
      },
    });
  }
  if (nofollow) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_NOFOLLOW",
      severity: "WARNING",
      title: "Page is marked nofollow",
      description:
        "A robots directive asks search engines not to follow page links.",
      recommendation: "Confirm that suppressing link discovery is intentional.",
      affectedElement:
        'meta[name="robots"], meta[name="googlebot"], X-Robots-Tag',
      evidence: { directives: [...robotsDirectives] },
    });
  }

  const socialTags = [
    ["og:title", "SEO_OG_TITLE_MISSING", "Open Graph title is missing"],
    [
      "og:description",
      "SEO_OG_DESCRIPTION_MISSING",
      "Open Graph description is missing",
    ],
    ["og:image", "SEO_OG_IMAGE_MISSING", "Open Graph image is missing"],
  ] as const;
  for (const [property, ruleCode, findingTitle] of socialTags) {
    const value = compactText(
      $("meta")
        .filter(
          (_index, element) =>
            ($(element).attr("property") ?? "").toLowerCase() === property,
        )
        .first()
        .attr("content"),
    );
    if (!value) {
      addFinding(findings, finalUrl.href, {
        ruleCode,
        severity: "RECOMMENDATION",
        title: findingTitle,
        description: `No non-empty ${property} value was found.`,
        recommendation:
          "Add accurate social-sharing metadata where sharing matters.",
        affectedElement: `meta[property="${property}"]`,
        evidence: { property, value: null },
      });
    }
  }

  const twitterCard = compactText(
    $("meta")
      .filter(
        (_index, element) =>
          ($(element).attr("name") ?? "").toLowerCase() === "twitter:card",
      )
      .first()
      .attr("content"),
  );
  if (!twitterCard) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_TWITTER_CARD_MISSING",
      severity: "RECOMMENDATION",
      title: "Twitter card metadata is missing",
      description: "No twitter:card meta tag was found.",
      recommendation:
        "Add a supported card type if rich social previews are needed.",
      affectedElement: 'meta[name="twitter:card"]',
    });
  }

  const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
  const hasMicrodata = $("[itemscope]").length > 0;
  const hasRdfa = $("[vocab]").length > 0;
  if (jsonLdScripts.length === 0 && !hasMicrodata && !hasRdfa) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_SCHEMA_MISSING",
      severity: "RECOMMENDATION",
      title: "Schema markup was not detected",
      description: "No JSON-LD, Microdata, or RDFa declaration was found.",
      recommendation:
        "Add relevant structured data only when it accurately represents visible content.",
      affectedElement:
        'script[type="application/ld+json"], [itemscope], [vocab]',
      evidence: {
        jsonLdBlocks: 0,
        microdataItems: $("[itemscope]").length,
        rdfaItems: $("[vocab]").length,
      },
    });
  }
  let invalidStructuredData = 0;
  for (const script of jsonLdScripts) {
    try {
      const parsed: unknown = JSON.parse($(script).text());
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const hasValidShape = entries.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const value = entry as Record<string, unknown>;
        if (value["@type"] && value["@context"]) return true;
        return (
          Array.isArray(value["@graph"]) &&
          value["@graph"].some(
            (item) =>
              item &&
              typeof item === "object" &&
              "@type" in (item as Record<string, unknown>),
          )
        );
      });
      if (!hasValidShape) invalidStructuredData += 1;
    } catch {
      invalidStructuredData += 1;
    }
  }
  if (invalidStructuredData > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_STRUCTURED_DATA_INVALID",
      severity: "WARNING",
      title: "Structured data could not be validated",
      description: `${invalidStructuredData} JSON-LD block(s) are invalid JSON or lack a recognizable @context/@type structure.`,
      recommendation:
        "Correct the JSON-LD and verify eligibility with the relevant search-engine testing tool.",
      affectedElement: 'script[type="application/ld+json"]',
      evidence: { invalidBlocks: invalidStructuredData },
      occurrences: invalidStructuredData,
    });
  }

  const language = compactText($("html").attr("lang")) || null;
  if (!language) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_HTML_LANG_MISSING",
      severity: "WARNING",
      title: "HTML language attribute is missing",
      description: "The root html element does not declare a language.",
      recommendation:
        "Add a valid BCP 47 language tag for browsers and assistive technology.",
      affectedElement: "html[lang]",
      evidence: { language: null },
    });
  } else if (!isValidLanguageTag(language)) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_LANGUAGE_INVALID",
      severity: "WARNING",
      title: "HTML language attribute is invalid",
      description: `“${language}” is not recognized as a valid language tag.`,
      recommendation: "Use a valid BCP 47 language tag such as en or en-US.",
      affectedElement: "html[lang]",
      evidence: { value: language },
    });
  }

  const images = $("img").toArray();
  const imagesWithoutAlt = images.filter(
    (image) => $(image).attr("alt") === undefined,
  );
  const imagesWithEmptyAlt = images.filter(
    (image) =>
      $(image).attr("alt") !== undefined && !$(image).attr("alt")?.trim(),
  );
  const imagesMissingAlt = imagesWithoutAlt.length;
  if (imagesMissingAlt > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_IMAGE_ALT_MISSING",
      severity: "WARNING",
      title: "Images are missing alt attributes",
      description: `${imagesMissingAlt} image(s) do not declare an alt attribute.`,
      recommendation:
        'Add meaningful alternative text, or alt="" for genuinely decorative images.',
      affectedElement: "img:not([alt])",
      evidence: {
        count: imagesMissingAlt,
        imageSources: imagesWithoutAlt
          .map((image) => resolveHttpUrl($(image).attr("src"), finalUrl.href))
          .slice(0, SEO_RULE_THRESHOLDS.maximumEvidenceUrls),
      },
      occurrences: imagesMissingAlt,
    });
  }
  if (imagesWithEmptyAlt.length > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_EMPTY_ALT_REVIEW",
      severity: "RECOMMENDATION",
      title: "Images with empty alt text need review",
      description: `${imagesWithEmptyAlt.length} image(s) use an empty alt attribute; this is correct only when those images are decorative.`,
      recommendation:
        "Confirm each image is decorative; otherwise provide concise alternative text.",
      affectedElement: 'img[alt=""]',
      evidence: {
        count: imagesWithEmptyAlt.length,
        imageSources: imagesWithEmptyAlt
          .map((image) => resolveHttpUrl($(image).attr("src"), finalUrl.href))
          .slice(0, SEO_RULE_THRESHOLDS.maximumEvidenceUrls),
      },
      occurrences: imagesWithEmptyAlt.length,
    });
  }

  const links: SeoLink[] = [];
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  let linksTruncated = false;
  let emptyAnchorCount = 0;
  let genericAnchorCount = 0;
  for (const anchor of $("a[href]").toArray()) {
    const rawHref = $(anchor).attr("href");
    const url = resolveHttpUrl(rawHref, finalUrl.href);
    if (!url) continue;
    const rel = ($(anchor).attr("rel") ?? "").toLowerCase().split(/\s+/);
    const text = compactText(
      [
        $(anchor).text(),
        $(anchor).attr("aria-label"),
        $(anchor).attr("title"),
        $(anchor).find("img[alt]").first().attr("alt"),
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!text) emptyAnchorCount += 1;
    else if (genericAnchorTexts.has(text.toLowerCase()))
      genericAnchorCount += 1;
    const internal = new URL(url).origin === input.siteOrigin;
    if (internal) internalLinkCount += 1;
    else externalLinkCount += 1;
    if (links.length < SEO_RULE_THRESHOLDS.maximumRetainedLinksPerPage) {
      links.push({ url, text, internal, nofollow: rel.includes("nofollow") });
    } else {
      linksTruncated = true;
    }
  }
  if (emptyAnchorCount > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_ANCHOR_TEXT_EMPTY",
      severity: "WARNING",
      title: "Links have no descriptive anchor text",
      description: `${emptyAnchorCount} link(s) have no text or accessible label.`,
      recommendation: "Give navigational links concise, descriptive text.",
      affectedElement: "a[href]",
      evidence: { count: emptyAnchorCount },
      occurrences: emptyAnchorCount,
    });
  }
  if (genericAnchorCount > 0) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_ANCHOR_TEXT_GENERIC",
      severity: "RECOMMENDATION",
      title: "Links use generic anchor text",
      description: `${genericAnchorCount} link(s) use text such as “click here” or “read more”.`,
      recommendation: "Describe the destination or action in the link text.",
      affectedElement: "a[href]",
      evidence: { count: genericAnchorCount },
      occurrences: genericAnchorCount,
    });
  }

  const crawlableInternalLinks = links.filter(
    (link) => link.internal && !link.nofollow,
  );
  if (
    crawlableInternalLinks.length < SEO_RULE_THRESHOLDS.minimumInternalLinks
  ) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_POOR_INTERNAL_LINKING",
      severity: "WARNING",
      title: "Page has too few crawlable internal links",
      description: `The page has ${crawlableInternalLinks.length} crawlable internal link(s); the audit threshold is at least ${SEO_RULE_THRESHOLDS.minimumInternalLinks}.`,
      recommendation:
        "Add useful links to related content and primary navigation.",
      affectedElement: "a[href]",
      evidence: {
        crawlableInternalLinkCount: crawlableInternalLinks.length,
        minimumInternalLinks: SEO_RULE_THRESHOLDS.minimumInternalLinks,
        internalLinkTargets: crawlableInternalLinks
          .map((link) => link.url)
          .slice(0, SEO_RULE_THRESHOLDS.maximumEvidenceUrls),
      },
    });
  }

  const paginationLink = (relation: "prev" | "next") => {
    const rawValue = $("link")
      .filter((_index, element) =>
        ($(element).attr("rel") ?? "")
          .toLowerCase()
          .split(/\s+/)
          .includes(relation),
      )
      .first()
      .attr("href");
    return resolveHttpUrl(rawValue, finalUrl.href);
  };
  const pagination = {
    previous: paginationLink("prev"),
    next: paginationLink("next"),
  };
  const pageNumberMatch = finalUrl.href.match(
    /(?:[?&](?:page|p)=(\d+)|\/page[/-](\d+))(?:[/?&#]|$)/i,
  );
  const pageNumber = Number(pageNumberMatch?.[1] ?? pageNumberMatch?.[2] ?? 0);
  if (pageNumber > 1 && !pagination.previous) {
    addFinding(findings, finalUrl.href, {
      ruleCode: "SEO_PAGINATION_PREVIOUS_MISSING",
      severity: "RECOMMENDATION",
      title: "Paginated URL has no previous-page link tag",
      description:
        "The URL appears paginated, but the document has no rel=prev link.",
      recommendation:
        "If your consumers use pagination link tags, add a valid previous-page URL; Google itself no longer uses rel=prev/next for indexing.",
      affectedElement: 'link[rel="prev"]',
    });
  }

  analyzeUrlStructure(finalUrl, findings);
  return {
    requestedUrl: input.requestedUrl,
    url: finalUrl.href,
    normalizedUrl: comparableUrl(finalUrl),
    statusCode: input.statusCode,
    depth: input.depth,
    loadTimeMs: input.loadTimeMs,
    discoveredVia: input.discoveredVia,
    title,
    metaDescription,
    canonicalUrl,
    language,
    noindex,
    nofollow,
    headingCount: headings.length,
    h1Count,
    imageCount: images.length,
    imagesMissingAlt,
    internalLinkCount,
    externalLinkCount,
    links,
    linksTruncated,
    pagination,
    findings: sortAuditRuleResults(findings),
  };
}

function duplicateFindings(
  pages: readonly SeoPageReport[],
  selector: (page: SeoPageReport) => string | null,
  ruleCode: string,
  title: string,
  field: "title" | "description",
): SeoFindingDraft[] {
  const groups = new Map<string, SeoPageReport[]>();
  for (const page of pages) {
    const value = selector(page);
    if (!value) continue;
    const key = value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  const findings: SeoFindingDraft[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const urls = group.map((page) => page.url);
    for (const page of group) {
      addFinding(findings, page.url, {
        ruleCode,
        severity: "WARNING",
        title,
        description: `This ${field} is shared by ${group.length} crawled pages.`,
        recommendation: `Write a distinct ${field} that reflects this page’s content.`,
        evidence: {
          duplicateCount: urls.length,
          duplicateUrls: urls.slice(0, SEO_RULE_THRESHOLDS.maximumEvidenceUrls),
        },
        occurrences: group.length,
      });
    }
  }
  return findings;
}

export function analyzeSeoSite(
  pages: readonly SeoPageReport[],
  sitemapUrls: readonly string[],
): SeoSiteReport {
  const findings: SeoFindingDraft[] = [
    ...pages.flatMap((page) => page.findings),
    ...duplicateFindings(
      pages,
      (page) => page.title,
      "SEO_DUPLICATE_TITLE",
      "Duplicate page title",
      "title",
    ),
    ...duplicateFindings(
      pages,
      (page) => page.metaDescription,
      "SEO_DUPLICATE_META_DESCRIPTION",
      "Duplicate meta description",
      "description",
    ),
  ];

  const crawledUrls = new Set(pages.map((page) => comparableUrl(page.url)));
  const inboundCounts = new Map<string, number>();
  for (const page of pages) {
    for (const link of page.links) {
      if (!link.internal) continue;
      const target = comparableUrl(link.url);
      if (!crawledUrls.has(target)) continue;
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1);
    }
  }
  const sitemapSet = new Set(
    sitemapUrls.flatMap((value) => {
      try {
        return [comparableUrl(value)];
      } catch {
        return [];
      }
    }),
  );
  const rootUrl = pages.find((page) => page.discoveredVia === "ROOT")?.url;
  if (!pages.some((page) => page.linksTruncated)) {
    for (const page of pages) {
      if (
        page.url !== rootUrl &&
        sitemapSet.has(page.normalizedUrl) &&
        (inboundCounts.get(page.normalizedUrl) ?? 0) === 0
      ) {
        addFinding(findings, page.url, {
          ruleCode: "SEO_ORPHAN_PAGE",
          severity: "WARNING",
          title: "Sitemap page has no internal incoming links",
          description:
            "The page was listed in a sitemap but no crawled page links to it.",
          recommendation:
            "Add a relevant internal link or remove the URL from the sitemap if it should not be indexed.",
          evidence: { source: "sitemap", inboundLinks: 0 },
        });
      }
    }
  }

  const slashVariants = new Map<string, SeoPageReport[]>();
  for (const page of pages) {
    const url = new URL(page.url);
    if (url.pathname === "/") continue;
    const key = `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
    slashVariants.set(key, [...(slashVariants.get(key) ?? []), page]);
  }
  for (const group of slashVariants.values()) {
    if (new Set(group.map((page) => new URL(page.url).pathname)).size < 2) {
      continue;
    }
    for (const page of group) {
      addFinding(findings, page.url, {
        ruleCode: "SEO_TRAILING_SLASH_INCONSISTENCY",
        severity: "WARNING",
        title: "Trailing-slash URL variants are crawlable",
        description:
          "Both slash and non-slash forms were found during this audit.",
        recommendation:
          "Choose one URL format and redirect plus canonicalize the alternate form.",
        evidence: { variants: group.map((item) => item.url) },
        occurrences: group.length,
      });
    }
  }

  const paginatedPages = pages.filter((page) =>
    /(?:[?&](?:page|p)=\d+|\/page[/-]\d+)(?:[/?&#]|$)/i.test(page.url),
  );
  if (
    paginatedPages.length > 1 &&
    paginatedPages.every(
      (page) => !page.pagination.previous && !page.pagination.next,
    )
  ) {
    addFinding(findings, null, {
      ruleCode: "SEO_PAGINATION_TAGS_MISSING",
      severity: "RECOMMENDATION",
      title: "Pagination link relationships were not found",
      description: `${paginatedPages.length} URLs look paginated, but none declare rel=prev or rel=next.`,
      recommendation:
        "Add relationships if other consumers require them; Google no longer uses these tags as an indexing signal.",
      evidence: { pageCount: paginatedPages.length },
      occurrences: paginatedPages.length,
    });
  }

  return {
    findings: sortAuditRuleResults(findings),
    metrics: [
      { key: "seo.pages_analyzed", value: pages.length, unit: "pages" },
      {
        key: "seo.indexable_pages",
        value: pages.filter((page) => !page.noindex).length,
        unit: "pages",
      },
      {
        key: "seo.critical_findings",
        value: findings.filter((item) => item.severity === "CRITICAL").length,
      },
      {
        key: "seo.warning_findings",
        value: findings.filter((item) => item.severity === "WARNING").length,
      },
      {
        key: "seo.recommendations",
        value: findings.filter((item) => item.severity === "RECOMMENDATION")
          .length,
      },
      {
        key: "seo.images_missing_alt",
        value: pages.reduce((sum, page) => sum + page.imagesMissingAlt, 0),
        unit: "images",
      },
      {
        key: "seo.orphan_pages",
        value: findings.filter((item) => item.ruleCode === "SEO_ORPHAN_PAGE")
          .length,
        unit: "pages",
      },
    ],
  };
}

export function parseSitemapDocument(xml: string): SitemapDocument {
  const $ = load(xml, { xmlMode: true });
  const type = $("sitemapindex").length
    ? "index"
    : $("urlset").length
      ? "urlset"
      : "unknown";
  const locations = $("loc")
    .map((_index, element) => compactText($(element).text()))
    .get()
    .filter(Boolean);
  return { type, locations: [...new Set(locations)] };
}
