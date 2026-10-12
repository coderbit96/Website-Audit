import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebsiteSchema,
  normalizeWebsiteUrl,
  WebsiteUrlError,
} from "./validation.js";

test("normalizes equivalent domain forms to one identity", () => {
  const inputs = [
    "example.com",
    "www.example.com",
    "https://example.com/",
    "HTTPS://WWW.EXAMPLE.COM/",
  ];

  const results = inputs.map(normalizeWebsiteUrl);

  assert.deepEqual(
    results.map((result) => result.normalizedUrl),
    ["example.com", "example.com", "example.com", "example.com"],
  );
  assert.equal(results[0]?.url, "https://example.com/");
});

test("preserves an explicit HTTP protocol while sharing the domain identity", () => {
  assert.deepEqual(normalizeWebsiteUrl("http://www.example.com"), {
    url: "http://example.com/",
    normalizedUrl: "example.com",
  });
});

test("normalizes default ports and keeps non-default ports distinct", () => {
  assert.equal(
    normalizeWebsiteUrl("https://example.com:443").normalizedUrl,
    "example.com",
  );
  assert.equal(
    normalizeWebsiteUrl("https://example.com:8443").normalizedUrl,
    "example.com:8443",
  );
});

test("rejects unsupported protocols, credentials, paths, local hosts, and IPs", () => {
  const invalidUrls = [
    "ftp://example.com",
    "file:///tmp/index.html",
    "https://user:password@example.com",
    "https://example.com/private",
    "https://example.com/?preview=true",
    "localhost",
    "internal.local",
    "127.0.0.1",
    "[::1]",
  ];

  for (const input of invalidUrls) {
    assert.throws(() => normalizeWebsiteUrl(input), WebsiteUrlError, input);
  }
});

test("validates website names and URLs with field-specific errors", () => {
  const result = createWebsiteSchema.safeParse({ name: "A", url: "localhost" });

  assert.equal(result.success, false);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    assert.ok(errors.name?.[0]);
    assert.ok(errors.url?.[0]);
  }
});
