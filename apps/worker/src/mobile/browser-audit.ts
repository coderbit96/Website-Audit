import { validatePublicHttpUrl } from "@website-audit/audit-core";
import {
  MOBILE_RULE_THRESHOLDS,
  type MobileBrowserPageObservation,
  type MobileElementObservation,
  type MobileSmallTextObservation,
  type MobileTouchTargetObservation,
} from "@website-audit/audit-rules";
import axe from "axe-core";
import { chromium, type BrowserContext, type Route } from "playwright";

import { blockAuditWebSockets } from "../browser/network-policy.js";

export type MobileBrowserCandidate = {
  url: string;
  normalizedUrl: string;
  statusCode: number | null;
  contentType: string | null;
};

export type MobileBrowserReport = {
  pages: readonly MobileBrowserPageObservation[];
  candidatePageCount: number;
  selectedPageCount: number;
  analyzedPageCount: number;
  failedPageCount: number;
  truncated: boolean;
};

export type MobileBrowserDependency = (
  urls: readonly string[],
  signal: AbortSignal,
) => Promise<{
  pages: MobileBrowserPageObservation[];
  failedPageCount: number;
}>;

export const MOBILE_BROWSER_VIEWPORT = Object.freeze({
  width: 390,
  height: 844,
});

function isHtmlCandidate(candidate: MobileBrowserCandidate): boolean {
  return (
    candidate.statusCode !== null &&
    candidate.statusCode >= 200 &&
    candidate.statusCode < 300 &&
    candidate.contentType?.toLowerCase().includes("text/html") === true
  );
}

export function selectMobileBrowserCandidates(
  pages: readonly MobileBrowserCandidate[],
  limit: number,
): MobileBrowserCandidate[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const seen = new Set<string>();
  return pages.filter(isHtmlCandidate).filter((page) => {
    if (seen.has(page.normalizedUrl) || seen.size >= boundedLimit) return false;
    seen.add(page.normalizedUrl);
    return true;
  });
}

function bounded(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeHtmlEvidence(value: string): string {
  return bounded(
    value.replace(
      /\s(?:href|src|action|value|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      (attribute) =>
        `${attribute.slice(0, attribute.indexOf("="))}="[redacted]"`,
    ),
    MOBILE_RULE_THRESHOLDS.maximumEvidenceStringLength,
  );
}

async function handleBrowserRequest(
  route: Route,
  allowedOrigin: string,
): Promise<boolean> {
  const requestUrl = route.request().url();
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    await route.abort("blockedbyclient");
    return false;
  }
  if (["data:", "blob:", "about:"].includes(parsed.protocol)) {
    await route.continue();
    return true;
  }
  if (parsed.origin !== allowedOrigin) {
    await route.abort("blockedbyclient");
    return false;
  }
  try {
    await validatePublicHttpUrl(parsed);
    await route.continue();
    return true;
  } catch {
    await route.abort("blockedbyclient");
    return false;
  }
}

type RenderedMobileMeasurements = {
  viewportWidth: number;
  documentWidth: number;
  overflowElements: MobileElementObservation[];
  overflowingImages: MobileElementObservation[];
  measuredTextCharacters: number;
  smallTextCharacters: number;
  smallTextSamples: MobileSmallTextObservation[];
};

async function measureRenderedPage(
  context: BrowserContext,
  url: string,
  signal: AbortSignal,
): Promise<MobileBrowserPageObservation> {
  signal.throwIfAborted();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("dialog", (dialog) => void dialog.dismiss());
  let blockedLayoutResourceCount = 0;
  await page.route("**/*", async (route) => {
    const allowed = await handleBrowserRequest(route, new URL(url).origin);
    if (
      !allowed &&
      ["stylesheet", "script", "image", "font"].includes(
        route.request().resourceType(),
      )
    ) {
      blockedLayoutResourceCount += 1;
    }
  });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    signal.throwIfAborted();
    const measurements = await page.evaluate(
      ({ maximumEvidenceItems, minimumReadableFontPixels, tolerance }) => {
        const safeText = (value: string, maximum: number) =>
          value.replace(/\s+/g, " ").trim().slice(0, maximum);
        const describe = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const id = safeText(htmlElement.id, 100);
          const classes = Array.from(htmlElement.classList)
            .slice(0, 3)
            .map((value) => safeText(value, 80))
            .filter(Boolean);
          const tag = element.tagName.toLowerCase();
          return {
            selector:
              `${tag}${id ? `#${id}` : ""}${classes.map((value) => `.${value}`).join("")}`.slice(
                0,
                300,
              ),
            html: `<${tag}${id ? ` id="${id}"` : ""}${classes.length > 0 ? ` class="${classes.join(" ")}"` : ""}>`,
          };
        };
        const visible = (element: Element, rectangle: DOMRect) => {
          const style = getComputedStyle(element);
          return (
            rectangle.width > 0 &&
            rectangle.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || "1") > 0
          );
        };
        const viewportWidth = window.innerWidth;
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth ?? 0,
        );
        const elementEvidence = (element: Element) => {
          const rectangle = element.getBoundingClientRect();
          const description = describe(element);
          return {
            ...description,
            left: Math.round(rectangle.left * 100) / 100,
            right: Math.round(rectangle.right * 100) / 100,
            width: Math.round(rectangle.width * 100) / 100,
            height: Math.round(rectangle.height * 100) / 100,
          };
        };
        const overflowing = Array.from(document.body.querySelectorAll("*"))
          .filter((element) => {
            const rectangle = element.getBoundingClientRect();
            return (
              visible(element, rectangle) &&
              (rectangle.right > viewportWidth + tolerance ||
                rectangle.left < -tolerance)
            );
          })
          .slice(0, maximumEvidenceItems)
          .map(elementEvidence);
        const overflowingImages = Array.from(document.images)
          .filter((image) => {
            const rectangle = image.getBoundingClientRect();
            return (
              image.complete &&
              image.naturalWidth > 0 &&
              visible(image, rectangle) &&
              (rectangle.width > viewportWidth + tolerance ||
                rectangle.right > viewportWidth + tolerance ||
                rectangle.left < -tolerance)
            );
          })
          .slice(0, maximumEvidenceItems)
          .map(elementEvidence);

        let measuredTextCharacters = 0;
        let smallTextCharacters = 0;
        const samples = new Map<string, MobileSmallTextObservation>();
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = safeText(node.textContent ?? "", 10_000);
          const parent = node.parentElement;
          if (
            !text ||
            !parent ||
            parent.closest("script, style, noscript, template")
          ) {
            continue;
          }
          const rectangle = parent.getBoundingClientRect();
          if (!visible(parent, rectangle)) continue;
          const fontSizePixels = Number.parseFloat(
            getComputedStyle(parent).fontSize,
          );
          if (!Number.isFinite(fontSizePixels)) continue;
          measuredTextCharacters += text.length;
          if (fontSizePixels >= minimumReadableFontPixels) continue;
          smallTextCharacters += text.length;
          const description = describe(parent);
          const key = `${description.selector}:${fontSizePixels}`;
          const existing = samples.get(key);
          samples.set(key, {
            selector: description.selector,
            fontSizePixels,
            characterCount: (existing?.characterCount ?? 0) + text.length,
            textSample: existing?.textSample ?? safeText(text, 120),
          });
        }
        return {
          viewportWidth,
          documentWidth,
          overflowElements: overflowing,
          overflowingImages,
          measuredTextCharacters,
          smallTextCharacters,
          smallTextSamples: [...samples.values()]
            .sort(
              (left, right) =>
                right.characterCount - left.characterCount ||
                left.selector.localeCompare(right.selector),
            )
            .slice(0, maximumEvidenceItems),
        } satisfies RenderedMobileMeasurements;
      },
      {
        maximumEvidenceItems: MOBILE_RULE_THRESHOLDS.maximumEvidenceItems,
        minimumReadableFontPixels:
          MOBILE_RULE_THRESHOLDS.minimumReadableFontPixels,
        tolerance: MOBILE_RULE_THRESHOLDS.horizontalOverflowTolerancePixels,
      },
    );

    await page.addScriptTag({ content: axe.source });
    const touchResults = await page.evaluate(async () => {
      const browserGlobal = globalThis as unknown as {
        axe: {
          run: (context: unknown, options: unknown) => Promise<axe.AxeResults>;
        };
        document: unknown;
      };
      return browserGlobal.axe.run(browserGlobal.document, {
        runOnly: { type: "rule", values: ["target-size"] },
        resultTypes: ["violations"],
      });
    });
    const touchTargets: MobileTouchTargetObservation[] = touchResults.violations
      .flatMap((violation) => violation.nodes)
      .slice(0, MOBILE_RULE_THRESHOLDS.maximumEvidenceItems)
      .map((node) => ({
        target: node.target.map((target) => bounded(String(target), 300)),
        html: safeHtmlEvidence(node.html),
        failureSummary: node.failureSummary
          ? bounded(
              node.failureSummary,
              MOBILE_RULE_THRESHOLDS.maximumEvidenceStringLength,
            )
          : null,
      }));

    return {
      url,
      ...measurements,
      layoutReliable: blockedLayoutResourceCount === 0,
      blockedLayoutResourceCount,
      touchTargets,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runPlaywrightMobileAnalysis(
  urls: readonly string[],
  signal: AbortSignal,
): Promise<{
  pages: MobileBrowserPageObservation[];
  failedPageCount: number;
}> {
  const firstUrl = urls[0];
  if (!firstUrl) return { pages: [], failedPageCount: 0 };
  const validated = await validatePublicHttpUrl(firstUrl);
  const allowedOrigin = validated.url.origin;
  const pinnedAddress =
    validated.resolution.addresses.find((address) => address.family === 4)
      ?.address ?? validated.resolution.addresses[0]?.address;
  if (!pinnedAddress) return { pages: [], failedPageCount: urls.length };

  const safeUrls: string[] = [];
  for (const url of urls) {
    try {
      const candidate = await validatePublicHttpUrl(url);
      if (candidate.url.origin === allowedOrigin) {
        safeUrls.push(candidate.url.href);
      }
    } catch {
      // Invalid or cross-origin pages are unavailable for browser analysis.
    }
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP ${validated.url.hostname} ${pinnedAddress}, EXCLUDE localhost`,
    ],
  });
  const onAbort = () => void browser.close().catch(() => undefined);
  signal.addEventListener("abort", onAbort, { once: true });
  const pages: MobileBrowserPageObservation[] = [];
  let failedPageCount = urls.length - safeUrls.length;
  try {
    for (const url of safeUrls) {
      signal.throwIfAborted();
      const context = await browser.newContext({
        acceptDownloads: false,
        bypassCSP: true,
        serviceWorkers: "block",
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
        viewport: MOBILE_BROWSER_VIEWPORT,
      });
      await blockAuditWebSockets(context);
      try {
        pages.push(await measureRenderedPage(context, url, signal));
      } catch (error) {
        if (signal.aborted) throw error;
        failedPageCount += 1;
      } finally {
        await context.close().catch(() => undefined);
      }
    }
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", onAbort);
    await browser.close().catch(() => undefined);
  }
  return { pages, failedPageCount };
}

export async function runMobileBrowserAudit(
  input: {
    pages: readonly MobileBrowserCandidate[];
    pageLimit: number;
    signal: AbortSignal;
  },
  analyze: MobileBrowserDependency = runPlaywrightMobileAnalysis,
): Promise<MobileBrowserReport> {
  input.signal.throwIfAborted();
  const allCandidates = input.pages.filter(isHtmlCandidate);
  const selected = selectMobileBrowserCandidates(input.pages, input.pageLimit);
  if (selected.length === 0) {
    return {
      pages: [],
      candidatePageCount: allCandidates.length,
      selectedPageCount: 0,
      analyzedPageCount: 0,
      failedPageCount: 0,
      truncated: allCandidates.length > 0,
    };
  }
  try {
    const result = await analyze(
      selected.map((page) => page.url),
      input.signal,
    );
    return {
      pages: result.pages,
      candidatePageCount: allCandidates.length,
      selectedPageCount: selected.length,
      analyzedPageCount: result.pages.length,
      failedPageCount: result.failedPageCount,
      truncated: allCandidates.length > selected.length,
    };
  } catch (error) {
    if (input.signal.aborted) throw error;
    return {
      pages: [],
      candidatePageCount: allCandidates.length,
      selectedPageCount: selected.length,
      analyzedPageCount: 0,
      failedPageCount: selected.length,
      truncated: allCandidates.length > selected.length,
    };
  }
}
