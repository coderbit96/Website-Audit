import { load, type CheerioAPI } from "cheerio";

import { isSameOrigin, normalizeCrawlUrl } from "./url.js";
import type {
  CrawledLink,
  ExtractedHtmlMetadata,
  ExtractedStructuredData,
  MixedContentResource,
} from "./types.js";

const extractionLimits = {
  robotsMeta: 20,
  canonicalDeclarations: 20,
  headings: 200,
  images: 500,
  links: 1_000,
  structuredData: 50,
  forms: 100,
  labels: 500,
  buttons: 500,
  scripts: 500,
  stylesheets: 200,
  iframes: 100,
  mixedContentResources: 500,
} as const;

const maximumTextLength = 4_096;
type ExtractedElement = ReturnType<CheerioAPI>[number];
const formControlSelector =
  'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]), select, textarea';

function compactText(
  value: string | undefined | null,
  maximumLength = maximumTextLength,
): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function resolveHttpUrl(
  value: string | undefined,
  baseUrl: string,
): string | null {
  if (!value) return null;
  try {
    return normalizeCrawlUrl(value, baseUrl);
  } catch {
    return null;
  }
}

function robotsDirectives(
  metaValues: readonly string[],
  xRobotsTag: string | undefined,
): Set<string> {
  const directives = new Set<string>();
  for (const value of [...metaValues, ...(xRobotsTag ? [xRobotsTag] : [])]) {
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

function metaContent(
  $: CheerioAPI,
  attribute: "name" | "property",
  key: string,
): string | null {
  return (
    compactText(
      $("meta")
        .filter(
          (_index, element) =>
            ($(element).attr(attribute) ?? "").toLowerCase() === key,
        )
        .first()
        .attr("content"),
    ) || null
  );
}

function socialMetaContent(
  $: CheerioAPI,
  preferredAttribute: "name" | "property",
  key: string,
): string | null {
  return (
    metaContent($, preferredAttribute, key) ??
    metaContent($, preferredAttribute === "name" ? "property" : "name", key)
  );
}

function limitedElements(
  elements: ExtractedElement[],
  field: keyof typeof extractionLimits,
  truncatedFields: Set<string>,
): ExtractedElement[] {
  const limit = extractionLimits[field];
  if (elements.length > limit) truncatedFields.add(field);
  return elements.slice(0, limit);
}

function structuredDataSummary(
  value: unknown,
): Pick<ExtractedStructuredData, "types" | "context"> {
  const types = new Set<string>();
  let context: string | null = null;
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== "object" || types.size >= 25) return;
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    const record = entry as Record<string, unknown>;
    const rawTypes = Array.isArray(record["@type"])
      ? record["@type"]
      : [record["@type"]];
    for (const type of rawTypes) {
      if (typeof type === "string" && type.trim()) {
        types.add(compactText(type, 200));
      }
    }
    if (context === null && typeof record["@context"] === "string") {
      context = compactText(record["@context"], 500);
    }
    if (Array.isArray(record["@graph"])) visit(record["@graph"]);
  };
  visit(value);
  return { types: [...types], context };
}

function hasAccessibleLabel(
  $: CheerioAPI,
  control: ExtractedElement,
  labeledControlIds: ReadonlySet<string>,
): boolean {
  const id = $(control).attr("id");
  return Boolean(
    compactText($(control).attr("aria-label")) ||
    compactText($(control).attr("aria-labelledby")) ||
    $(control).closest("label").length > 0 ||
    (id && labeledControlIds.has(id)),
  );
}

function collectMixedContent(input: {
  $: CheerioAPI;
  pageUrl: string;
  truncatedFields: Set<string>;
}): { resources: MixedContentResource[]; totalCount: number } {
  if (new URL(input.pageUrl).protocol !== "https:") {
    return { resources: [], totalCount: 0 };
  }
  const resources: MixedContentResource[] = [];
  const seen = new Set<string>();
  const selectors = [
    ["img[src]", "src", "IMAGE"],
    ["script[src]", "src", "SCRIPT"],
    ['link[rel~="stylesheet"][href]', "href", "STYLESHEET"],
    ["iframe[src]", "src", "IFRAME"],
    ["form[action]", "action", "FORM"],
    ["audio[src], video[src], source[src]", "src", "MEDIA"],
  ] as const;

  for (const [selector, attribute, type] of selectors) {
    for (const element of input.$(selector).toArray()) {
      const url = resolveHttpUrl(
        input.$(element).attr(attribute),
        input.pageUrl,
      );
      if (!url || new URL(url).protocol !== "http:") continue;
      const identity = `${type}:${url}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (resources.length >= extractionLimits.mixedContentResources) {
        input.truncatedFields.add("mixedContentResources");
        continue;
      }
      resources.push({ url, type });
    }
  }
  return { resources, totalCount: seen.size };
}

export function extractHtmlMetadata(input: {
  html: string;
  pageUrl: string;
  siteOrigin: string;
  xRobotsTag?: string;
}): ExtractedHtmlMetadata {
  const $ = load(input.html);
  const truncatedFields = new Set<string>();
  const title = compactText($("head > title").first().text()) || null;
  const description = metaContent($, "name", "description");
  const allCanonicalDeclarations = $("link")
    .filter((_index, element) =>
      ($(element).attr("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("canonical"),
    )
    .map((_index, element) => compactText($(element).attr("href")))
    .get()
    .filter(Boolean);
  if (
    allCanonicalDeclarations.length > extractionLimits.canonicalDeclarations
  ) {
    truncatedFields.add("canonicalDeclarations");
  }
  const canonicalDeclarations = allCanonicalDeclarations
    .slice(0, extractionLimits.canonicalDeclarations)
    .map((value) => resolveHttpUrl(value, input.pageUrl) ?? value);
  const canonical = canonicalDeclarations[0] ?? null;
  const allRobotsMeta = $("meta")
    .filter((_index, element) => {
      const name = ($(element).attr("name") ?? "").toLowerCase();
      return name === "robots" || name === "googlebot";
    })
    .map((_index, element) => compactText($(element).attr("content")))
    .get()
    .filter(Boolean);
  if (allRobotsMeta.length > extractionLimits.robotsMeta) {
    truncatedFields.add("robotsMeta");
  }
  const robotsMeta = allRobotsMeta.slice(0, extractionLimits.robotsMeta);
  const directives = robotsDirectives(allRobotsMeta, input.xRobotsTag);

  const allHeadings = $("h1, h2, h3, h4, h5, h6").toArray();
  const headings = limitedElements(
    allHeadings,
    "headings",
    truncatedFields,
  ).map((heading) => ({
    level: Number($(heading).prop("tagName")?.slice(1)) as
      1 | 2 | 3 | 4 | 5 | 6,
    text: compactText($(heading).text()),
  }));

  const allImages = $("img").toArray();
  const images = limitedElements(allImages, "images", truncatedFields).map(
    (image) => {
      const srcset = compactText($(image).attr("srcset"), 2_000) || null;
      const pictureSrcset =
        compactText(
          $(image)
            .closest("picture")
            .find("source[srcset]")
            .first()
            .attr("srcset"),
          2_000,
        ) || null;
      return {
        src: resolveHttpUrl($(image).attr("src"), input.pageUrl),
        alt:
          $(image).attr("alt") === undefined
            ? null
            : compactText($(image).attr("alt")),
        srcset,
        sizes: compactText($(image).attr("sizes"), 1_000) || null,
        hasResponsiveSource: Boolean(srcset || pictureSrcset),
      };
    },
  );

  const linksByIdentity = new Map<string, CrawledLink>();
  const anchors = $("a[href]").toArray();
  if (anchors.length > extractionLimits.links) truncatedFields.add("links");
  for (const anchor of anchors.slice(0, extractionLimits.links)) {
    const url = resolveHttpUrl($(anchor).attr("href"), input.pageUrl);
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
      1_000,
    );
    const classification = isSameOrigin(url, input.siteOrigin)
      ? "INTERNAL"
      : "EXTERNAL";
    linksByIdentity.set(url, {
      url,
      normalizedUrl: url,
      text,
      classification,
      nofollow: rel.includes("nofollow"),
    });
  }
  const links = [...linksByIdentity.values()];

  const allStructuredData = $("script")
    .filter(
      (_index, script) =>
        ($(script).attr("type") ?? "")
          .toLowerCase()
          .split(";", 1)[0]
          ?.trim() === "application/ld+json",
    )
    .toArray();
  const allStructuredDataSummaries = allStructuredData.map(
    (script): ExtractedStructuredData => {
      try {
        const parsed: unknown = JSON.parse($(script).text());
        return { validJson: true, ...structuredDataSummary(parsed) };
      } catch {
        return { validJson: false, types: [], context: null };
      }
    },
  );
  if (allStructuredDataSummaries.length > extractionLimits.structuredData) {
    truncatedFields.add("structuredData");
  }
  const structuredData = allStructuredDataSummaries.slice(
    0,
    extractionLimits.structuredData,
  );

  const allForms = $("form").toArray();
  const allLabels = $("label").toArray();
  const labeledControlIds = new Set(
    allLabels
      .map((label) => $(label).attr("for"))
      .filter((id): id is string => Boolean(id)),
  );
  const forms = limitedElements(allForms, "forms", truncatedFields).map(
    (form) => {
      const controls = $(form).find(formControlSelector).toArray();
      return {
        action: resolveHttpUrl($(form).attr("action"), input.pageUrl),
        method: compactText($(form).attr("method") || "get", 20).toLowerCase(),
        controlCount: controls.length,
        labeledControlCount: controls.filter((control) =>
          hasAccessibleLabel($, control, labeledControlIds),
        ).length,
      };
    },
  );

  const labels = limitedElements(allLabels, "labels", truncatedFields).map(
    (label) => ({
      htmlFor: compactText($(label).attr("for"), 500) || null,
      text: compactText($(label).text(), 1_000),
    }),
  );

  const allButtons = $(
    'button, input[type="button"], input[type="submit"], input[type="reset"]',
  ).toArray();
  const buttons = limitedElements(allButtons, "buttons", truncatedFields).map(
    (button) => {
      const text = compactText(
        $(button).prop("tagName") === "button"
          ? $(button).text()
          : $(button).attr("value"),
        1_000,
      );
      return {
        type: compactText($(button).attr("type") || "submit", 30).toLowerCase(),
        text,
        accessibleName:
          compactText(
            $(button).attr("aria-label") || $(button).attr("title"),
            1_000,
          ) || text,
      };
    },
  );

  const allScripts = $("script").toArray();
  const scripts = limitedElements(allScripts, "scripts", truncatedFields).map(
    (script) => {
      const rawSrc = $(script).attr("src");
      const src = resolveHttpUrl(rawSrc, input.pageUrl);
      return {
        src,
        type: compactText($(script).attr("type"), 100) || null,
        inline: !rawSrc,
        async: $(script).attr("async") !== undefined,
        defer: $(script).attr("defer") !== undefined,
      };
    },
  );

  const allStylesheets = $("link")
    .filter((_index, element) =>
      ($(element).attr("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("stylesheet"),
    )
    .toArray();
  const stylesheets = limitedElements(
    allStylesheets,
    "stylesheets",
    truncatedFields,
  ).flatMap((stylesheet) => {
    const href = resolveHttpUrl($(stylesheet).attr("href"), input.pageUrl);
    return href
      ? [
          {
            href,
            media: compactText($(stylesheet).attr("media"), 200) || null,
          },
        ]
      : [];
  });

  const allIframes = $("iframe").toArray();
  const iframes = limitedElements(allIframes, "iframes", truncatedFields).map(
    (iframe) => ({
      src: resolveHttpUrl($(iframe).attr("src"), input.pageUrl),
      title: compactText($(iframe).attr("title"), 1_000) || null,
    }),
  );

  const mixedContent = collectMixedContent({
    $,
    pageUrl: input.pageUrl,
    truncatedFields,
  });
  const allFormControls = $("form").find(formControlSelector).toArray();

  return {
    title,
    description,
    robotsMeta,
    robotsDirectives: [...directives],
    canonical,
    canonicalDeclarations,
    indexable: !directives.has("noindex"),
    followable: !directives.has("nofollow"),
    headings,
    openGraph: {
      title: socialMetaContent($, "property", "og:title"),
      description: socialMetaContent($, "property", "og:description"),
      image: resolveHttpUrl(
        socialMetaContent($, "property", "og:image") ?? undefined,
        input.pageUrl,
      ),
    },
    twitter: {
      card: socialMetaContent($, "name", "twitter:card"),
      title: socialMetaContent($, "name", "twitter:title"),
      description: socialMetaContent($, "name", "twitter:description"),
      image: resolveHttpUrl(
        socialMetaContent($, "name", "twitter:image") ?? undefined,
        input.pageUrl,
      ),
    },
    language: compactText($("html").attr("lang"), 100) || null,
    images,
    internalLinks: links.filter((link) => link.classification === "INTERNAL"),
    externalLinks: links.filter((link) => link.classification === "EXTERNAL"),
    structuredData,
    viewport: metaContent($, "name", "viewport"),
    forms,
    labels,
    buttons,
    scripts,
    stylesheets,
    iframes,
    mixedContentResources: mixedContent.resources,
    counts: {
      headings: allHeadings.length,
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
      images: allImages.length,
      imagesMissingAlt: allImages.filter(
        (image) => $(image).attr("alt") === undefined,
      ).length,
      structuredData: allStructuredData.length,
      invalidStructuredData: allStructuredDataSummaries.filter(
        (item) => !item.validJson,
      ).length,
      forms: allForms.length,
      formControls: allFormControls.length,
      labeledFormControls: allFormControls.filter((control) =>
        hasAccessibleLabel($, control, labeledControlIds),
      ).length,
      labels: allLabels.length,
      buttons: allButtons.length,
      scripts: allScripts.length,
      stylesheets: allStylesheets.length,
      iframes: allIframes.length,
      mixedContentResources: mixedContent.totalCount,
    },
    truncatedFields: [...truncatedFields],
  };
}

export function isHtmlResponse(
  contentType: string | undefined,
  body: Buffer,
): boolean {
  const normalizedType = contentType?.toLowerCase() ?? "";
  if (
    normalizedType.includes("text/html") ||
    normalizedType.includes("application/xhtml+xml")
  ) {
    return true;
  }
  if (normalizedType && !normalizedType.startsWith("text/")) return false;
  return /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(
    body.subarray(0, 512).toString("utf8"),
  );
}

export function normalizeContentType(value: string | undefined): string | null {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return contentType || null;
}
