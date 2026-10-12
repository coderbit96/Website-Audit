import assert from "node:assert/strict";
import test from "node:test";

import {
  SecureHttpError,
  type SecureHttpResponse,
} from "@website-audit/audit-core";

import {
  observePassiveTransport,
  type PassiveTransportFetch,
  type PassiveTransportRoot,
} from "./transport-probe.js";

function root(
  overrides: Partial<PassiveTransportRoot> = {},
): PassiveTransportRoot {
  return {
    requestedUrl: "https://example.com/",
    url: "https://example.com/",
    statusCode: 200,
    redirectChain: [],
    ...overrides,
  };
}

function response(
  requestedUrl: string,
  overrides: Partial<SecureHttpResponse> = {},
): SecureHttpResponse {
  return {
    requestedUrl,
    finalUrl: requestedUrl,
    statusCode: 200,
    headers: { "content-type": "text/html" },
    setCookieHeaders: [],
    body: Buffer.from("ok"),
    durationMs: 10,
    redirectCount: 0,
    redirects: [],
    ...overrides,
  };
}

test("observes an HTTP to HTTPS upgrade with one bounded passive request", async () => {
  const requests: string[] = [];
  const fetchUrl: PassiveTransportFetch = (value, options) => {
    const url = value.toString();
    requests.push(url);
    assert.equal(options?.method, "GET");
    assert.equal(options?.maximumBodyBytes, 64 * 1024);
    assert.equal(options?.maximumRedirects, 5);
    return Promise.resolve(
      response(url, {
        finalUrl: "https://example.com/",
        redirectCount: 1,
        redirects: [
          {
            sourceUrl: "http://example.com/",
            statusCode: 301,
            destinationUrl: "https://example.com/",
          },
        ],
      }),
    );
  };

  const observation = await observePassiveTransport(
    root(),
    new AbortController().signal,
    fetchUrl,
  );

  assert.deepEqual(requests, ["http://example.com/"]);
  assert.equal(observation.tlsAvailability, "AVAILABLE");
  assert.equal(observation.httpToHttpsBehavior, "REDIRECTS_TO_HTTPS");
});

test("uses the existing HTTP crawl and probes HTTPS availability once", async () => {
  const requests: string[] = [];
  const fetchUrl: PassiveTransportFetch = (value) => {
    const url = value.toString();
    requests.push(url);
    return Promise.resolve(response(url, { statusCode: 404 }));
  };

  const observation = await observePassiveTransport(
    root({
      requestedUrl: "http://example.com/",
      url: "http://example.com/",
    }),
    new AbortController().signal,
    fetchUrl,
  );

  assert.deepEqual(requests, ["https://example.com/"]);
  assert.equal(observation.tlsAvailability, "AVAILABLE");
  assert.equal(observation.httpToHttpsBehavior, "DOES_NOT_REDIRECT");
  assert.equal(observation.httpStatusCode, 200);
});

test("keeps an inconclusive HTTP probe unknown instead of claiming a flaw", async () => {
  const observation = await observePassiveTransport(
    root(),
    new AbortController().signal,
    () =>
      Promise.reject(
        new SecureHttpError("NETWORK_ERROR", "Request failed", {
          retryable: true,
        }),
      ),
  );

  assert.equal(observation.tlsAvailability, "AVAILABLE");
  assert.equal(observation.httpToHttpsBehavior, "CANNOT_DETERMINE");
  assert.equal(observation.httpStatusCode, null);
  assert.match(observation.httpEvidence, /NETWORK_ERROR/);
});

test("propagates audit cancellation before making a probe", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Audit cancelled"));
  let called = false;

  await assert.rejects(
    observePassiveTransport(root(), controller.signal, () => {
      called = true;
      return Promise.resolve(response("http://example.com/"));
    }),
    /Audit cancelled/,
  );
  assert.equal(called, false);
});
