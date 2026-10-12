import {
  validatePublicHttpUrl,
  type AuditRuleResult,
} from "@website-audit/audit-core";
import {
  analyzeAccessibilityPages,
  type AccessibilityPageInput,
  type AccessibilityViolationInput,
} from "@website-audit/audit-rules";
import axe from "axe-core";
import { chromium, type BrowserContext, type Route } from "playwright";

import { blockAuditWebSockets } from "../browser/network-policy.js";

export type AccessibilityBrowserCandidate = {
  url: string;
  normalizedUrl: string;
  statusCode: number | null;
  contentType: string | null;
};

export type AccessibilityBrowserReport = {
  findings: AuditRuleResult[];
  candidatePageCount: number;
  selectedPageCount: number;
  analyzedPageCount: number;
  failedPageCount: number;
  truncated: boolean;
};

export type AccessibilityBrowserDependency = (
  urls: readonly string[],
  signal: AbortSignal,
) => Promise<{
  pages: AccessibilityPageInput[];
  failedPageCount: number;
}>;

const axeRunOptions = {
  runOnly: {
    type: "tag",
    values: [
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ],
  },
  resultTypes: ["violations"],
} as const;

function isHtmlCandidate(candidate: AccessibilityBrowserCandidate): boolean {
  return (
    candidate.statusCode !== null &&
    candidate.statusCode >= 200 &&
    candidate.statusCode < 300 &&
    candidate.contentType?.toLowerCase().includes("text/html") === true
  );
}

export function selectAccessibilityBrowserCandidates(
  pages: readonly AccessibilityBrowserCandidate[],
  limit: number,
): AccessibilityBrowserCandidate[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const seen = new Set<string>();
  return pages.filter(isHtmlCandidate).filter((page) => {
    if (seen.has(page.normalizedUrl) || seen.size >= boundedLimit) return false;
    seen.add(page.normalizedUrl);
    return true;
  });
}

function toViolationInput(violation: axe.Result): AccessibilityViolationInput {
  return {
    id: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    description: violation.description,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target.map(String),
      html: node.html,
      failureSummary: node.failureSummary ?? null,
    })),
  };
}

async function handleBrowserRequest(
  route: Route,
  allowedOrigin: string,
): Promise<void> {
  const requestUrl = route.request().url();
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    await route.abort("blockedbyclient");
    return;
  }

  if (["data:", "blob:", "about:"].includes(parsed.protocol)) {
    await route.continue();
    return;
  }
  if (parsed.origin !== allowedOrigin) {
    await route.abort("blockedbyclient");
    return;
  }
  try {
    await validatePublicHttpUrl(parsed);
    await route.continue();
  } catch {
    await route.abort("blockedbyclient");
  }
}

async function analyzePage(
  context: BrowserContext,
  url: string,
  signal: AbortSignal,
): Promise<AccessibilityPageInput> {
  signal.throwIfAborted();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("dialog", (dialog) => void dialog.dismiss());
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    signal.throwIfAborted();
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async (options) => {
      const browserGlobal = globalThis as unknown as {
        axe: {
          run: (
            context: unknown,
            runOptions: unknown,
          ) => Promise<axe.AxeResults>;
        };
        document: unknown;
      };
      return browserGlobal.axe.run(browserGlobal.document, options);
    }, axeRunOptions);
    return {
      url,
      violations: results.violations.map(toViolationInput),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runPlaywrightAxe(
  urls: readonly string[],
  signal: AbortSignal,
): Promise<{ pages: AccessibilityPageInput[]; failedPageCount: number }> {
  const firstUrl = urls[0];
  if (!firstUrl) return { pages: [], failedPageCount: 0 };
  const validated = await validatePublicHttpUrl(firstUrl);
  const allowedOrigin = validated.url.origin;
  const pinnedAddress =
    validated.resolution.addresses.find((address) => address.family === 4)
      ?.address ?? validated.resolution.addresses[0]?.address;
  if (!pinnedAddress) {
    return { pages: [], failedPageCount: urls.length };
  }

  const safeUrls: string[] = [];
  for (const url of urls) {
    try {
      const candidate = await validatePublicHttpUrl(url);
      if (candidate.url.origin === allowedOrigin)
        safeUrls.push(candidate.url.href);
    } catch {
      // Invalid and cross-origin destinations are excluded from browser analysis.
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
  const pages: AccessibilityPageInput[] = [];
  let failedPageCount = urls.length - safeUrls.length;
  try {
    for (const url of safeUrls) {
      signal.throwIfAborted();
      const context = await browser.newContext({
        acceptDownloads: false,
        bypassCSP: true,
        serviceWorkers: "block",
        viewport: { width: 1_440, height: 900 },
      });
      await blockAuditWebSockets(context);
      await context.route("**/*", (route) =>
        handleBrowserRequest(route, allowedOrigin),
      );
      try {
        pages.push(await analyzePage(context, url, signal));
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

export async function runAccessibilityBrowserAudit(
  input: {
    pages: readonly AccessibilityBrowserCandidate[];
    pageLimit: number;
    signal: AbortSignal;
  },
  analyze: AccessibilityBrowserDependency = runPlaywrightAxe,
): Promise<AccessibilityBrowserReport> {
  input.signal.throwIfAborted();
  const allCandidates = input.pages.filter(isHtmlCandidate);
  const selected = selectAccessibilityBrowserCandidates(
    input.pages,
    input.pageLimit,
  );
  if (selected.length === 0) {
    return {
      findings: [],
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
      findings: analyzeAccessibilityPages(result.pages).findings,
      candidatePageCount: allCandidates.length,
      selectedPageCount: selected.length,
      analyzedPageCount: result.pages.length,
      failedPageCount: result.failedPageCount,
      truncated: allCandidates.length > selected.length,
    };
  } catch (error) {
    if (input.signal.aborted) throw error;
    return {
      findings: [],
      candidatePageCount: allCandidates.length,
      selectedPageCount: selected.length,
      analyzedPageCount: 0,
      failedPageCount: selected.length,
      truncated: allCandidates.length > selected.length,
    };
  }
}
