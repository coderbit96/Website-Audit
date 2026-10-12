import { validatePublicHttpUrl } from "@website-audit/audit-core";
import {
  PERFORMANCE_RULE_THRESHOLDS,
  PageSpeedStrategy,
  PerformanceMetricSource,
  type PageSpeedOpportunity,
  type PageSpeedOpportunityType,
  type PageSpeedStrategyResult,
  type PerformanceMetric,
} from "@website-audit/audit-rules";

export const PAGESPEED_API_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export const PageSpeedUnavailableReason = {
  API_KEY_MISSING: "API_KEY_MISSING",
  TIMEOUT: "TIMEOUT",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  API_UNAVAILABLE: "API_UNAVAILABLE",
} as const;
export type PageSpeedUnavailableReason =
  (typeof PageSpeedUnavailableReason)[keyof typeof PageSpeedUnavailableReason];

export type PageSpeedAvailableResult = {
  available: true;
  result: PageSpeedStrategyResult;
};

export type PageSpeedUnavailableResult = {
  available: false;
  strategy: PageSpeedStrategy;
  reason: PageSpeedUnavailableReason;
  message: string;
};

export type PageSpeedRunResult =
  PageSpeedAvailableResult | PageSpeedUnavailableResult;

export type PageSpeedFetch = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;

export type PageSpeedDependencies = {
  fetcher?: PageSpeedFetch;
  validateTarget?: typeof validatePublicHttpUrl;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const MAXIMUM_RESPONSE_BYTES = 10 * 1024 * 1024;

async function readBoundedResponseText(
  response: Response,
): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
const opportunityAuditIds = Object.freeze({
  RENDER_BLOCKING: ["render-blocking-insight", "render-blocking-resources"],
  UNUSED_JAVASCRIPT: ["unused-javascript"],
  UNUSED_CSS: ["unused-css-rules"],
  CACHING: ["use-cache-insight", "uses-long-cache-ttl"],
  IMAGE_OPTIMIZATION: [
    "image-delivery-insight",
    "modern-image-formats",
    "uses-optimized-images",
    "efficient-animated-content",
    "uses-responsive-images",
  ],
}) satisfies Readonly<
  Partial<Record<PageSpeedOpportunityType, readonly string[]>>
>;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedString(value: unknown): string | null {
  const string = nonEmptyString(value);
  return string
    ? string
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .slice(0, PERFORMANCE_RULE_THRESHOLDS.maximumEvidenceStringLength)
    : null;
}

function safeResourceUrl(value: unknown): string | null {
  const string = nonEmptyString(value);
  if (!string) return null;
  try {
    const url = new URL(string);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.slice(
      0,
      PERFORMANCE_RULE_THRESHOLDS.maximumEvidenceStringLength,
    );
  } catch {
    return null;
  }
}

function auditItems(audit: JsonRecord): JsonRecord[] {
  const details = record(audit.details);
  if (!details || !Array.isArray(details.items)) return [];
  return details.items.map(record).filter((item): item is JsonRecord => !!item);
}

function nestedEvidenceItems(audit: JsonRecord): JsonRecord[] {
  const output: JsonRecord[] = [];
  const visit = (items: readonly unknown[], depth: number): void => {
    for (const value of items) {
      if (output.length >= PERFORMANCE_RULE_THRESHOLDS.maximumEvidenceItems) {
        return;
      }
      const item = record(value);
      if (!item) continue;
      const nestedItems = Array.isArray(item.items) ? item.items : [];
      const subItems = record(item.subItems);
      const nestedSubItems = Array.isArray(subItems?.items)
        ? subItems.items
        : [];
      if (depth < 3 && (nestedItems.length > 0 || nestedSubItems.length > 0)) {
        visit([...nestedItems, ...nestedSubItems], depth + 1);
      } else {
        output.push(item);
      }
    }
  };
  visit(auditItems(audit), 0);
  return output;
}

function firstFinite(
  records: readonly JsonRecord[],
  fields: readonly string[],
) {
  for (const entry of records) {
    for (const field of fields) {
      const value = finiteNumber(entry[field]);
      if (value !== null) return value;
    }
  }
  return undefined;
}

function evidenceItems(
  audit: JsonRecord,
  includeNested = false,
): Readonly<Record<string, unknown>>[] {
  return (includeNested ? nestedEvidenceItems(audit) : auditItems(audit))
    .slice(0, PERFORMANCE_RULE_THRESHOLDS.maximumEvidenceItems)
    .map((item) => {
      const url = safeResourceUrl(item.url);
      const node = record(item.node);
      const selector = boundedString(node?.selector);
      const snippet = boundedString(node?.snippet);
      const transferSize = finiteNumber(item.transferSize);
      const resourceSize = finiteNumber(item.resourceSize);
      const wastedBytes = finiteNumber(item.wastedBytes);
      const wastedMs = finiteNumber(item.wastedMs);
      const cacheLifetimeMs = finiteNumber(item.cacheLifetimeMs);
      return {
        ...(url ? { url } : {}),
        ...(selector ? { selector } : {}),
        ...(snippet ? { snippet } : {}),
        ...(transferSize !== null ? { transferSize } : {}),
        ...(resourceSize !== null ? { resourceSize } : {}),
        ...(wastedBytes !== null ? { wastedBytes } : {}),
        ...(wastedMs !== null ? { wastedMs } : {}),
        ...(cacheLifetimeMs !== null ? { cacheLifetimeMs } : {}),
      };
    });
}

function metric(
  value: number | null | undefined,
  source: PerformanceMetric["source"],
): PerformanceMetric | undefined {
  return value !== null && value !== undefined && value >= 0
    ? { value, source }
    : undefined;
}

function labMetric(
  audits: JsonRecord,
  auditIds: readonly string[],
): PerformanceMetric | undefined {
  for (const auditId of auditIds) {
    const audit = record(audits[auditId]);
    const value = finiteNumber(audit?.numericValue);
    if (value !== null) return metric(value, PerformanceMetricSource.LAB);
  }
  return undefined;
}

function fieldMetric(
  root: JsonRecord,
  metricIds: readonly string[],
): PerformanceMetric | undefined {
  for (const [containerName, source] of [
    ["loadingExperience", PerformanceMetricSource.URL_FIELD],
    ["originLoadingExperience", PerformanceMetricSource.ORIGIN_FIELD],
  ] as const) {
    const metrics = record(record(root[containerName])?.metrics);
    if (!metrics) continue;
    for (const metricId of metricIds) {
      const value = finiteNumber(record(metrics[metricId])?.percentile);
      if (value !== null) return metric(value, source);
    }
  }
  return undefined;
}

function opportunity(
  type: Exclude<PageSpeedOpportunityType, "LARGE_IMAGES">,
  auditId: string,
  audit: JsonRecord,
): PageSpeedOpportunity | null {
  const score = finiteNumber(audit.score);
  const details = nestedEvidenceItems(audit);
  const detailsRecord = record(audit.details);
  const savingsMs = firstFinite(
    [audit, detailsRecord ?? {}],
    ["overallSavingsMs"],
  );
  const savingsBytes = firstFinite(
    [audit, detailsRecord ?? {}],
    ["overallSavingsBytes"],
  );
  if (
    nonEmptyString(audit.scoreDisplayMode) === "notApplicable" ||
    score === 1 ||
    (details.length === 0 &&
      (savingsMs === undefined || savingsMs <= 0) &&
      (savingsBytes === undefined || savingsBytes <= 0))
  ) {
    return null;
  }
  const displayValue = boundedString(audit.displayValue);
  return {
    type,
    auditId,
    title: boundedString(audit.title) ?? auditId,
    ...(displayValue ? { displayValue } : {}),
    itemCount: details.length,
    ...(savingsMs !== undefined ? { savingsMs } : {}),
    ...(savingsBytes !== undefined ? { savingsBytes } : {}),
    items: evidenceItems(audit, true),
  };
}

function largeImageOpportunity(
  audits: JsonRecord,
): PageSpeedOpportunity | null {
  const networkAudit = record(audits["network-requests"]);
  if (!networkAudit) return null;
  const images = auditItems(networkAudit).filter((item) => {
    const resourceType = nonEmptyString(item.resourceType)?.toLowerCase();
    const bytes =
      finiteNumber(item.transferSize) ?? finiteNumber(item.resourceSize) ?? 0;
    return (
      resourceType === "image" &&
      bytes >= PERFORMANCE_RULE_THRESHOLDS.largeImageBytes
    );
  });
  if (images.length === 0) return null;
  const syntheticAudit: JsonRecord = { details: { items: images } };
  return {
    type: "LARGE_IMAGES",
    auditId: "network-requests",
    title: "Large image resources",
    displayValue: `${images.length} image resource${images.length === 1 ? "" : "s"} at or above ${PERFORMANCE_RULE_THRESHOLDS.largeImageBytes} bytes`,
    itemCount: images.length,
    items: evidenceItems(syntheticAudit),
  };
}

function parsePageSpeedResponse(
  value: unknown,
  strategy: PageSpeedStrategy,
  analyzedUrl: string,
): PageSpeedStrategyResult | null {
  const root = record(value);
  const lighthouse = record(root?.lighthouseResult);
  const runtimeError = record(lighthouse?.runtimeError);
  if (runtimeError && nonEmptyString(runtimeError.code) !== "NO_ERROR") {
    return null;
  }
  const categories = record(lighthouse?.categories);
  const performance = record(categories?.performance);
  const score = finiteNumber(performance?.score);
  const audits = record(lighthouse?.audits);
  if (score === null || score < 0 || score > 1 || !audits) return null;

  const opportunities: PageSpeedOpportunity[] = [];
  for (const [type, auditIds] of Object.entries(opportunityAuditIds) as Array<
    [Exclude<PageSpeedOpportunityType, "LARGE_IMAGES">, readonly string[]]
  >) {
    for (const auditId of auditIds) {
      const audit = record(audits[auditId]);
      if (!audit) continue;
      const parsed = opportunity(type, auditId, audit);
      if (parsed) opportunities.push(parsed);
    }
  }
  const largeImages = largeImageOpportunity(audits);
  if (largeImages) opportunities.push(largeImages);

  const labTtfb = labMetric(audits, ["server-response-time"]);
  const insightTtfb = firstFinite(
    auditItems(record(audits["document-latency-insight"]) ?? {}),
    ["serverResponseTime", "serverResponseTimeMs", "timeToFirstByte"],
  );
  const lcpMs = labMetric(audits, ["largest-contentful-paint"]);
  const inpMs =
    fieldMetric(root ?? {}, [
      "INTERACTION_TO_NEXT_PAINT",
      "INTERACTION_TO_NEXT_PAINT_MS",
    ]) ?? labMetric(audits, ["interaction-to-next-paint"]);
  const cls = labMetric(audits, ["cumulative-layout-shift"]);
  const fcpMs = labMetric(audits, ["first-contentful-paint"]);
  const ttfbMs =
    labTtfb ??
    metric(insightTtfb, PerformanceMetricSource.LAB) ??
    fieldMetric(root ?? {}, [
      "EXPERIMENTAL_TIME_TO_FIRST_BYTE",
      "EXPERIMENTAL_TIME_TO_FIRST_BYTE_MS",
    ]);
  const speedIndexMs = labMetric(audits, ["speed-index"]);
  const totalBlockingTimeMs = labMetric(audits, ["total-blocking-time"]);
  return {
    strategy,
    analyzedUrl,
    finalUrl:
      nonEmptyString(lighthouse?.finalDisplayedUrl) ??
      nonEmptyString(lighthouse?.finalUrl) ??
      analyzedUrl,
    performanceScore: Math.round(score * 10_000) / 100,
    metrics: {
      ...(lcpMs ? { lcpMs } : {}),
      ...(inpMs ? { inpMs } : {}),
      ...(cls ? { cls } : {}),
      ...(fcpMs ? { fcpMs } : {}),
      ...(ttfbMs ? { ttfbMs } : {}),
      ...(speedIndexMs ? { speedIndexMs } : {}),
      ...(totalBlockingTimeMs ? { totalBlockingTimeMs } : {}),
    },
    opportunities,
  };
}

function unavailable(
  strategy: PageSpeedStrategy,
  reason: PageSpeedUnavailableReason,
  message: string,
): PageSpeedUnavailableResult {
  return { available: false, strategy, reason, message };
}

function quotaResponse(status: number, body: unknown): boolean {
  if (status === 429) return true;
  const root = record(body);
  const error = record(root?.error);
  const message = nonEmptyString(error?.message)?.toLowerCase() ?? "";
  return status === 403 && /quota|rate limit|daily limit/.test(message);
}

async function runStrategy(
  input: {
    url: string;
    apiKey: string;
    strategy: PageSpeedStrategy;
    signal: AbortSignal;
    timeoutMs: number;
  },
  dependencies: PageSpeedDependencies,
): Promise<PageSpeedRunResult> {
  input.signal.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(input.signal.reason);
  input.signal.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("PageSpeed request timed out."));
  }, input.timeoutMs);
  try {
    const requestUrl = new URL(PAGESPEED_API_ENDPOINT);
    requestUrl.searchParams.set("url", input.url);
    requestUrl.searchParams.set("key", input.apiKey);
    requestUrl.searchParams.set("strategy", input.strategy.toLowerCase());
    requestUrl.searchParams.set("category", "performance");
    requestUrl.searchParams.set("locale", "en");
    const response = await (dependencies.fetcher ?? fetch)(requestUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAXIMUM_RESPONSE_BYTES
    ) {
      return unavailable(
        input.strategy,
        PageSpeedUnavailableReason.INVALID_RESPONSE,
        "PageSpeed returned an unexpectedly large response.",
      );
    }
    const text = await readBoundedResponseText(response);
    if (text === null) {
      return unavailable(
        input.strategy,
        PageSpeedUnavailableReason.INVALID_RESPONSE,
        "PageSpeed returned an unexpectedly large response.",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok && response.status === 429) {
        return unavailable(
          input.strategy,
          PageSpeedUnavailableReason.QUOTA_EXCEEDED,
          "PageSpeed quota or rate limit was exceeded.",
        );
      }
      if (!response.ok && response.status >= 500) {
        return unavailable(
          input.strategy,
          PageSpeedUnavailableReason.API_UNAVAILABLE,
          "PageSpeed is currently unavailable.",
        );
      }
      return unavailable(
        input.strategy,
        PageSpeedUnavailableReason.INVALID_RESPONSE,
        "PageSpeed returned invalid JSON.",
      );
    }
    if (!response.ok) {
      return quotaResponse(response.status, body)
        ? unavailable(
            input.strategy,
            PageSpeedUnavailableReason.QUOTA_EXCEEDED,
            "PageSpeed quota or rate limit was exceeded.",
          )
        : unavailable(
            input.strategy,
            response.status >= 500
              ? PageSpeedUnavailableReason.API_UNAVAILABLE
              : PageSpeedUnavailableReason.INVALID_RESPONSE,
            "PageSpeed did not accept or complete the analysis request.",
          );
    }
    const parsed = parsePageSpeedResponse(body, input.strategy, input.url);
    return parsed
      ? { available: true, result: parsed }
      : unavailable(
          input.strategy,
          PageSpeedUnavailableReason.INVALID_RESPONSE,
          "PageSpeed returned no valid Lighthouse performance result.",
        );
  } catch (error) {
    if (input.signal.aborted) throw error;
    return unavailable(
      input.strategy,
      timedOut
        ? PageSpeedUnavailableReason.TIMEOUT
        : PageSpeedUnavailableReason.API_UNAVAILABLE,
      timedOut
        ? "PageSpeed analysis timed out."
        : "PageSpeed is currently unavailable.",
    );
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abortFromParent);
  }
}

export async function runPageSpeedAnalysis(
  input: {
    url: string;
    apiKey: string | undefined;
    strategies: readonly PageSpeedStrategy[];
    signal: AbortSignal;
    timeoutMs?: number;
  },
  dependencies: PageSpeedDependencies = {},
): Promise<PageSpeedRunResult[]> {
  input.signal.throwIfAborted();
  const strategies = [...new Set(input.strategies)];
  if (!input.apiKey?.trim()) {
    return strategies.map((strategy) =>
      unavailable(
        strategy,
        PageSpeedUnavailableReason.API_KEY_MISSING,
        "PageSpeed analysis is not configured.",
      ),
    );
  }
  let validated;
  try {
    validated = await (dependencies.validateTarget ?? validatePublicHttpUrl)(
      input.url,
    );
  } catch (error) {
    if (input.signal.aborted) throw error;
    return strategies.map((strategy) =>
      unavailable(
        strategy,
        PageSpeedUnavailableReason.API_UNAVAILABLE,
        "The PageSpeed target could not be safely validated.",
      ),
    );
  }
  return Promise.all(
    strategies.map((strategy) =>
      runStrategy(
        {
          url: validated.url.href,
          apiKey: input.apiKey?.trim() ?? "",
          strategy,
          signal: input.signal,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        dependencies,
      ),
    ),
  );
}
