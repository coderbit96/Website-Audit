import assert from "node:assert/strict";
import test from "node:test";

import { mutationOriginResponse, readBoundedJsonBody } from "./request.js";

test("allows same-origin browser mutations", () => {
  const request = new Request("https://app.example.test/api/websites", {
    headers: {
      origin: "https://app.example.test",
      "sec-fetch-site": "same-origin",
    },
    method: "POST",
  });

  assert.equal(mutationOriginResponse(request), null);
});

test("rejects a mutation with an untrusted Origin", () => {
  const request = new Request("https://app.example.test/api/websites", {
    headers: { origin: "https://evil.example.test" },
    method: "POST",
  });

  assert.equal(mutationOriginResponse(request)?.status, 403);
});

test("rejects cross-site fetch metadata even when Origin is spoofed", () => {
  const request = new Request("https://app.example.test/api/websites", {
    headers: {
      origin: "https://app.example.test",
      "sec-fetch-site": "cross-site",
    },
    method: "POST",
  });

  assert.equal(mutationOriginResponse(request)?.status, 403);
});

test("permits an origin-free server-to-server mutation", () => {
  const request = new Request("https://app.example.test/api/websites", {
    method: "POST",
  });

  assert.equal(mutationOriginResponse(request), null);
});

test("rejects an oversized JSON payload before parsing it", async () => {
  const request = new Request("https://app.example.test/api/websites", {
    body: JSON.stringify({ value: "x".repeat(128) }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const result = await readBoundedJsonBody(request, 32);
  assert.equal(result.response?.status, 413);
});

test("parses a bounded JSON payload", async () => {
  const request = new Request("https://app.example.test/api/websites", {
    body: JSON.stringify({ name: "Example" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const result = await readBoundedJsonBody(request);
  assert.deepEqual(result.body, { name: "Example" });
});
