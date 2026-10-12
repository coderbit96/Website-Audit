import {
  sortAuditRuleResults,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

import {
  MOBILE_RULE_THRESHOLDS,
  MOBILE_SCORE_COMPONENT_WEIGHTS,
  createMobileRuleResults,
} from "./mobile-rules.js";

export type MobileImageInput = {
  src: string | null;
  hasResponsiveSource: boolean;
};

export type MobilePageInput = {
  url: string;
  viewport: string | null;
  images: readonly MobileImageInput[];
};

export type MobileElementObservation = {
  selector: string;
  html: string;
  left: number;
  right: number;
  width: number;
  height: number;
};

export type MobileTouchTargetObservation = {
  target: readonly string[];
  html: string;
  failureSummary: string | null;
};

export type MobileSmallTextObservation = {
  selector: string;
  fontSizePixels: number;
  characterCount: number;
  textSample: string;
};

export type MobileBrowserPageObservation = {
  url: string;
  viewportWidth: number;
  documentWidth: number;
  layoutReliable: boolean;
  blockedLayoutResourceCount: number;
  overflowElements: readonly MobileElementObservation[];
  overflowingImages: readonly MobileElementObservation[];
  touchTargets: readonly MobileTouchTargetObservation[];
  measuredTextCharacters: number;
  smallTextCharacters: number;
  smallTextSamples: readonly MobileSmallTextObservation[];
};

export type MobileAuditMetric = {
  category: "MOBILE";
  key: string;
  value: number;
  unit: string;
};

export type MobileSiteReport = {
  findings: AuditRuleResult[];
  metrics: readonly MobileAuditMetric[];
  evaluatedPageCount: number;
  browserAnalyzedPageCount: number;
  reliableBrowserPageCount: number;
  pageSpeedScore: number | null;
};

type ViewportValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "WIDTH_MISSING"
        | "WIDTH_INVALID"
        | "INITIAL_SCALE_INVALID"
        | "INITIAL_SCALE_BELOW_ONE";
    };

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function validateMobileViewport(viewport: string): ViewportValidation {
  const directives = new Map<string, string>();
  for (const part of viewport.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    directives.set(
      part.slice(0, separator).trim().toLowerCase(),
      part
        .slice(separator + 1)
        .trim()
        .toLowerCase(),
    );
  }
  const width = directives.get("width");
  if (width === undefined) return { valid: false, reason: "WIDTH_MISSING" };
  if (
    width !== "device-width" &&
    (!/^\d+(?:\.\d+)?$/.test(width) || Number(width) <= 0)
  ) {
    return { valid: false, reason: "WIDTH_INVALID" };
  }
  const rawInitialScale = directives.get("initial-scale");
  if (rawInitialScale !== undefined) {
    const initialScale = Number(rawInitialScale);
    if (!Number.isFinite(initialScale) || initialScale <= 0) {
      return { valid: false, reason: "INITIAL_SCALE_INVALID" };
    }
    if (initialScale < 1) {
      return { valid: false, reason: "INITIAL_SCALE_BELOW_ONE" };
    }
  }
  return { valid: true };
}

function aggregateMatch(
  ruleCode: string,
  entries: readonly (Readonly<Record<string, unknown>> & { url: string })[],
): AuditRuleMatch | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  const affectedUrls = [...new Set(sorted.map((entry) => entry.url))].sort();
  const details = sorted.slice(0, MOBILE_RULE_THRESHOLDS.maximumEvidenceItems);
  return {
    ruleCode,
    affectedUrl: affectedUrls.length === 1 ? (affectedUrls[0] ?? null) : null,
    occurrences: entries.length,
    evidence: {
      affectedUrlCount: affectedUrls.length,
      affectedUrls: affectedUrls.slice(
        0,
        MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
      ),
      details,
      evidenceTruncated:
        sorted.length > details.length ||
        affectedUrls.length > MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
    },
  };
}

export function calculateMobileCompositeScore(
  ruleScore: number,
  pageSpeedScore: number | null,
): number {
  if (!Number.isFinite(ruleScore) || ruleScore < 0 || ruleScore > 100) {
    throw new Error("Mobile rule score must be between 0 and 100.");
  }
  if (pageSpeedScore === null) return round(ruleScore);
  if (
    !Number.isFinite(pageSpeedScore) ||
    pageSpeedScore < 0 ||
    pageSpeedScore > 100
  ) {
    throw new Error("Mobile PageSpeed score must be between 0 and 100.");
  }
  return round(
    ruleScore * MOBILE_SCORE_COMPONENT_WEIGHTS.rules +
      pageSpeedScore * MOBILE_SCORE_COMPONENT_WEIGHTS.pageSpeed,
  );
}

export function analyzeMobileSite(input: {
  pages: readonly MobilePageInput[];
  browserPages: readonly MobileBrowserPageObservation[];
  pageSpeedScore: number | null;
}): MobileSiteReport {
  const pages = [...input.pages].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  const browserPages = [...input.browserPages].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  const missingViewport: Array<Record<string, unknown> & { url: string }> = [];
  const invalidViewport: Array<Record<string, unknown> & { url: string }> = [];
  const horizontalOverflow: Array<Record<string, unknown> & { url: string }> =
    [];
  const imageOverflow: Array<Record<string, unknown> & { url: string }> = [];
  const touchTargets: Array<Record<string, unknown> & { url: string }> = [];
  const smallText: Array<Record<string, unknown> & { url: string }> = [];

  let imageCount = 0;
  let responsiveImageMarkupCount = 0;
  for (const page of pages) {
    imageCount += page.images.length;
    responsiveImageMarkupCount += page.images.filter(
      (image) => image.hasResponsiveSource,
    ).length;
    if (page.viewport === null) {
      missingViewport.push({ url: page.url, observedViewport: null });
      continue;
    }
    const validation = validateMobileViewport(page.viewport);
    if (!validation.valid) {
      invalidViewport.push({
        url: page.url,
        observedViewport: page.viewport,
        reason: validation.reason,
      });
    }
  }

  for (const page of browserPages) {
    if (!page.layoutReliable) continue;
    const hasDocumentOverflow =
      page.documentWidth >
      page.viewportWidth +
        MOBILE_RULE_THRESHOLDS.horizontalOverflowTolerancePixels;
    if (hasDocumentOverflow) {
      horizontalOverflow.push({
        url: page.url,
        viewportWidth: page.viewportWidth,
        documentWidth: page.documentWidth,
        overflowPixels: page.documentWidth - page.viewportWidth,
        elements: page.overflowElements.slice(
          0,
          MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
        ),
      });
    }
    if (hasDocumentOverflow && page.overflowingImages.length > 0) {
      imageOverflow.push({
        url: page.url,
        viewportWidth: page.viewportWidth,
        images: page.overflowingImages.slice(
          0,
          MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
        ),
        imageCount: page.overflowingImages.length,
      });
    }
    if (page.touchTargets.length > 0) {
      touchTargets.push({
        url: page.url,
        axeRuleId: "target-size",
        nodes: page.touchTargets.slice(
          0,
          MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
        ),
        nodeCount: page.touchTargets.length,
      });
    }
    const smallTextRatio =
      page.measuredTextCharacters === 0
        ? 0
        : page.smallTextCharacters / page.measuredTextCharacters;
    if (
      page.measuredTextCharacters >=
        MOBILE_RULE_THRESHOLDS.minimumMeasuredTextCharacters &&
      smallTextRatio >= MOBILE_RULE_THRESHOLDS.smallTextCharacterRatio
    ) {
      smallText.push({
        url: page.url,
        minimumReadableFontPixels:
          MOBILE_RULE_THRESHOLDS.minimumReadableFontPixels,
        measuredTextCharacters: page.measuredTextCharacters,
        smallTextCharacters: page.smallTextCharacters,
        smallTextRatio: round(smallTextRatio, 4),
        samples: page.smallTextSamples.slice(
          0,
          MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
        ),
      });
    }
  }

  const matches = [
    aggregateMatch("MOBILE_VIEWPORT_MISSING", missingViewport),
    aggregateMatch("MOBILE_VIEWPORT_INVALID", invalidViewport),
    aggregateMatch("MOBILE_HORIZONTAL_OVERFLOW", horizontalOverflow),
    aggregateMatch("MOBILE_IMAGE_OVERFLOW", imageOverflow),
    aggregateMatch("MOBILE_TOUCH_TARGET_SIZE", touchTargets),
    aggregateMatch("MOBILE_TEXT_READABILITY", smallText),
  ].filter((match): match is AuditRuleMatch => match !== null);
  const reliableBrowserPageCount = browserPages.filter(
    (page) => page.layoutReliable,
  ).length;
  const blockedLayoutResourceCount = browserPages.reduce(
    (total, page) => total + page.blockedLayoutResourceCount,
    0,
  );
  const metrics: MobileAuditMetric[] = [
    {
      category: "MOBILE",
      key: "mobile.pages_evaluated",
      value: pages.length,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.viewport_missing_pages",
      value: missingViewport.length,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.viewport_invalid_pages",
      value: invalidViewport.length,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.images_observed",
      value: imageCount,
      unit: "images",
    },
    {
      category: "MOBILE",
      key: "mobile.images_with_responsive_markup",
      value: responsiveImageMarkupCount,
      unit: "images",
    },
    ...(imageCount > 0
      ? [
          {
            category: "MOBILE" as const,
            key: "mobile.responsive_image_markup_ratio",
            value: round(responsiveImageMarkupCount / imageCount, 4),
            unit: "ratio",
          },
        ]
      : []),
    {
      category: "MOBILE",
      key: "mobile.browser_analyzed_pages",
      value: browserPages.length,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.browser_reliable_layout_pages",
      value: reliableBrowserPageCount,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.browser_blocked_layout_resources",
      value: blockedLayoutResourceCount,
      unit: "resources",
    },
    {
      category: "MOBILE",
      key: "mobile.horizontal_overflow_pages",
      value: horizontalOverflow.length,
      unit: "pages",
    },
    {
      category: "MOBILE",
      key: "mobile.touch_target_issue_pages",
      value: touchTargets.length,
      unit: "pages",
    },
    ...(input.pageSpeedScore === null
      ? []
      : [
          {
            category: "MOBILE" as const,
            key: "mobile.pagespeed.score",
            value: round(input.pageSpeedScore),
            unit: "score",
          },
        ]),
  ];

  return {
    findings: sortAuditRuleResults(createMobileRuleResults(matches)),
    metrics,
    evaluatedPageCount: pages.length,
    browserAnalyzedPageCount: browserPages.length,
    reliableBrowserPageCount,
    pageSpeedScore: input.pageSpeedScore,
  };
}
