import assert from "node:assert/strict";
import test from "node:test";

import { publicAuditRequestSchema } from "./validation.js";

test("accepts a public homepage and the empty abuse trap", () => {
  const result = publicAuditRequestSchema.safeParse({
    url: "https://www.example.com/",
    company: "",
  });

  assert.equal(result.success, true);
});

test("rejects private, credentialed, path, and unsupported targets", () => {
  for (const url of [
    "http://localhost",
    "http://127.0.0.1",
    "https://user:secret@example.com",
    "https://example.com/private",
    "ftp://example.com",
  ]) {
    assert.equal(
      publicAuditRequestSchema.safeParse({ url, company: "" }).success,
      false,
      url,
    );
  }
});

test("rejects populated bot traps and client-added configuration", () => {
  assert.equal(
    publicAuditRequestSchema.safeParse({
      url: "example.com",
      company: "bot",
    }).success,
    false,
  );
  assert.equal(
    publicAuditRequestSchema.safeParse({
      url: "example.com",
      company: "",
      maximumPages: 500,
    }).success,
    false,
  );
});
