import assert from "node:assert/strict";
import test from "node:test";

import {
  PageSpeedStrategy,
  PerformanceMetricSource,
} from "@website-audit/audit-rules";

import {
  PageSpeedUnavailableReason,
  runPageSpeedAnalysis,
  type PageSpeedFetch,
} from "./pagespeed.js";

const validateTarget = async (value: string | URL) => ({
  url: new URL(value),
  resolution: {
    hostname: new URL(value).hostname,
    addresses: [{ address: "93.184.216.34", family: 4 as const }],
    validatedAt: new Date(0),
  },
});

function lighthouseResponse(score = 0.73): Record<string, unknown> {
  return {
    loadingExperience: {
      metrics: {
        INTERACTION_TO_NEXT_PAINT: { percentile: 240 },
      },
    },
    lighthouseResult: {
      finalDisplayedUrl: "https://example.com/",
      categories: { performance: { score } },
      audits: {
        "largest-contentful-paint": { numericValue: 2_600 },
        "cumulative-layout-shift": { numericValue: 0.12 },
        "first-contentful-paint": { numericValue: 1_200 },
        "server-response-time": { numericValue: 310 },
        "speed-index": { numericValue: 1_500 },
        "total-blocking-time": { numericValue: 180 },
        "render-blocking-insight": {
          score: 0.5,
          title: "Render blocking requests",
          displayValue: "Potential savings of 200 ms",
          details: {
            overallSavingsMs: 200,
            items: [{ url: "https://example.com/site.css?token=secret" }],
          },
        },
        "unused-javascript": {
          score: 0.6,
          title: "Reduce unused JavaScript",
          details: {
            overallSavingsBytes: 20_000,
            items: [
              {
                url: "https://example.com/app.js?signature=private",
                wastedBytes: 20_000,
              },
            ],
          },
        },
        "unused-css-rules": {
          score: 0.8,
          title: "Reduce unused CSS",
          details: {
            overallSavingsBytes: 10_000,
            items: [
              { url: "https://example.com/site.css", wastedBytes: 10_000 },
            ],
          },
        },
        "use-cache-insight": {
          score: 0.7,
          title: "Use efficient cache lifetimes",
          details: {
            items: [
              { url: "https://example.com/app.js", cacheLifetimeMs: 1_000 },
            ],
          },
        },
        "image-delivery-insight": {
          score: 0.6,
          title: "Improve image delivery",
          details: {
            items: [
              {
                items: [
                  {
                    url: "https://cdn.example.com/hero.jpg?token=secret",
                    wastedBytes: 50_000,
                  },
                ],
              },
            ],
          },
        },
        "network-requests": {
          details: {
            items: [
              {
                url: "https://cdn.example.com/hero.jpg?signature=private",
                resourceType: "Image",
                transferSize: 300_000,
                resourceSize: 400_000,
              },
            ],
          },
        },
      },
    },
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("collects current PageSpeed metrics and evidence without URL secrets", async () => {
  const requestedStrategies: string[] = [];
  const fetcher: PageSpeedFetch = (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("key"), "server-secret-key");
    assert.equal(url.searchParams.get("url"), "https://example.com/");
    requestedStrategies.push(url.searchParams.get("strategy") ?? "");
    return Promise.resolve(jsonResponse(lighthouseResponse()));
  };

  const results = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: "server-secret-key",
      strategies: [PageSpeedStrategy.MOBILE, PageSpeedStrategy.DESKTOP],
      signal: new AbortController().signal,
    },
    { fetcher, validateTarget },
  );

  assert.deepEqual(requestedStrategies.sort(), ["desktop", "mobile"]);
  assert.equal(
    results.every((result) => result.available),
    true,
  );
  const mobile = results.find(
    (result) => result.available && result.result.strategy === "MOBILE",
  );
  assert.ok(mobile?.available);
  assert.equal(mobile.result.performanceScore, 73);
  assert.deepEqual(mobile.result.metrics.inpMs, {
    value: 240,
    source: PerformanceMetricSource.URL_FIELD,
  });
  assert.equal(mobile.result.metrics.lcpMs?.value, 2_600);
  assert.equal(mobile.result.metrics.ttfbMs?.value, 310);
  assert.deepEqual(
    new Set(mobile.result.opportunities.map((item) => item.type)),
    new Set([
      "RENDER_BLOCKING",
      "UNUSED_JAVASCRIPT",
      "UNUSED_CSS",
      "CACHING",
      "IMAGE_OPTIMIZATION",
      "LARGE_IMAGES",
    ]),
  );
  assert.equal(
    JSON.stringify(mobile.result.opportunities).includes("signature=private"),
    false,
  );
});

test("supports legacy PageSpeed opportunity audit IDs", async () => {
  const payload = lighthouseResponse();
  const lighthouse = payload.lighthouseResult as Record<string, unknown>;
  const audits = lighthouse.audits as Record<string, unknown>;
  delete audits["render-blocking-insight"];
  delete audits["use-cache-insight"];
  audits["render-blocking-resources"] = {
    score: 0,
    title: "Eliminate render-blocking resources",
    details: {
      overallSavingsMs: 100,
      items: [{ url: "https://a.test/a.css" }],
    },
  };
  audits["uses-long-cache-ttl"] = {
    score: 0.5,
    title: "Use long cache TTLs",
    details: {
      items: [{ url: "https://a.test/a.js", cacheLifetimeMs: 1_000 }],
    },
  };

  const [result] = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: "key",
      strategies: [PageSpeedStrategy.DESKTOP],
      signal: new AbortController().signal,
    },
    { fetcher: () => Promise.resolve(jsonResponse(payload)), validateTarget },
  );
  assert.ok(result?.available);
  assert.deepEqual(
    new Set(result.result.opportunities.map((item) => item.type)),
    new Set([
      "RENDER_BLOCKING",
      "UNUSED_JAVASCRIPT",
      "UNUSED_CSS",
      "CACHING",
      "IMAGE_OPTIMIZATION",
      "LARGE_IMAGES",
    ]),
  );
  assert.equal(
    result.result.opportunities.some(
      (item) => item.auditId === "render-blocking-resources",
    ),
    true,
  );
  assert.equal(
    result.result.opportunities.some(
      (item) => item.auditId === "uses-long-cache-ttl",
    ),
    true,
  );
});

test("does not call Google when the server API key is missing", async () => {
  let called = false;
  const results = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: " ",
      strategies: [PageSpeedStrategy.MOBILE],
      signal: new AbortController().signal,
    },
    {
      fetcher: () => {
        called = true;
        return Promise.resolve(jsonResponse({}));
      },
      validateTarget,
    },
  );
  assert.equal(called, false);
  assert.deepEqual(results[0], {
    available: false,
    strategy: "MOBILE",
    reason: PageSpeedUnavailableReason.API_KEY_MISSING,
    message: "PageSpeed analysis is not configured.",
  });
});

test("isolates quota, invalid response, and API availability failures", async () => {
  const scenarios = [
    {
      response: jsonResponse(
        { error: { message: "Daily quota exceeded" } },
        { status: 403 },
      ),
      reason: PageSpeedUnavailableReason.QUOTA_EXCEEDED,
    },
    {
      response: new Response("not-json", { status: 200 }),
      reason: PageSpeedUnavailableReason.INVALID_RESPONSE,
    },
    {
      response: new Response("service unavailable", { status: 503 }),
      reason: PageSpeedUnavailableReason.API_UNAVAILABLE,
    },
    {
      response: jsonResponse({ lighthouseResult: { audits: {} } }),
      reason: PageSpeedUnavailableReason.INVALID_RESPONSE,
    },
  ] as const;

  for (const scenario of scenarios) {
    const [result] = await runPageSpeedAnalysis(
      {
        url: "https://example.com/",
        apiKey: "key",
        strategies: [PageSpeedStrategy.MOBILE],
        signal: new AbortController().signal,
      },
      {
        fetcher: () => Promise.resolve(scenario.response),
        validateTarget,
      },
    );
    assert.equal(result?.available, false);
    if (!result?.available) assert.equal(result?.reason, scenario.reason);
  }
});

test("stops reading an oversized streamed PageSpeed response", async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
  });
  const [result] = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: "key",
      strategies: [PageSpeedStrategy.MOBILE],
      signal: new AbortController().signal,
    },
    {
      fetcher: () => Promise.resolve(new Response(stream)),
      validateTarget,
    },
  );
  assert.equal(result?.available, false);
  if (!result?.available) {
    assert.equal(result.reason, PageSpeedUnavailableReason.INVALID_RESPONSE);
  }
  assert.ok(pulls < 20);
});

test("times out without throwing and preserves explicit audit cancellation", async () => {
  const hangingFetch: PageSpeedFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason ?? new Error("aborted")),
        { once: true },
      );
    });
  const [timedOut] = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: "key",
      strategies: [PageSpeedStrategy.MOBILE],
      signal: new AbortController().signal,
      timeoutMs: 5,
    },
    { fetcher: hangingFetch, validateTarget },
  );
  assert.equal(timedOut?.available, false);
  if (!timedOut?.available) {
    assert.equal(timedOut?.reason, PageSpeedUnavailableReason.TIMEOUT);
  }

  const controller = new AbortController();
  controller.abort(new Error("audit cancelled"));
  await assert.rejects(
    runPageSpeedAnalysis(
      {
        url: "https://example.com/",
        apiKey: "key",
        strategies: [PageSpeedStrategy.MOBILE],
        signal: controller.signal,
      },
      { fetcher: hangingFetch, validateTarget },
    ),
    /audit cancelled/,
  );
});

test("keeps a valid desktop result when mobile analysis is unavailable", async () => {
  const fetcher: PageSpeedFetch = (input) => {
    const strategy = new URL(input).searchParams.get("strategy");
    return Promise.resolve(
      strategy === "mobile"
        ? new Response("invalid")
        : jsonResponse(lighthouseResponse(0.91)),
    );
  };
  const results = await runPageSpeedAnalysis(
    {
      url: "https://example.com/",
      apiKey: "key",
      strategies: [PageSpeedStrategy.MOBILE, PageSpeedStrategy.DESKTOP],
      signal: new AbortController().signal,
    },
    { fetcher, validateTarget },
  );
  assert.equal(results.filter((result) => result.available).length, 1);
  assert.equal(results.filter((result) => !result.available).length, 1);
  const desktop = results.find((result) => result.available);
  assert.equal(desktop?.available && desktop.result.performanceScore, 91);
});
