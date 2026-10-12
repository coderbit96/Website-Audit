import assert from "node:assert/strict";
import test from "node:test";

import { parseLeadListFilters, publicLeadRequestSchema } from "./validation.js";

const validRequest = {
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+91 98765 43210",
  auditToken: "a".repeat(43),
  requestedService: "seo",
  source: "public-audit",
  company: "",
} as const;

test("accepts a bounded public lead request", () => {
  const result = publicLeadRequestSchema.safeParse(validRequest);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "jane@example.com");
});

test("rejects invalid contact data, tokens, services, and bot traps", () => {
  for (const change of [
    { name: "J" },
    { email: "not-an-email" },
    { phone: "call me maybe" },
    { auditToken: "short" },
    { requestedService: "unknown" },
    { company: "bot value" },
  ]) {
    assert.equal(
      publicLeadRequestSchema.safeParse({ ...validRequest, ...change }).success,
      false,
    );
  }
});

test("rejects client-added audit facts", () => {
  assert.equal(
    publicLeadRequestSchema.safeParse({
      ...validRequest,
      auditId: "507f1f77bcf86cd799439011",
      auditScore: 100,
      topDetectedProblems: [],
      websiteUrl: "https://attacker.example/",
    }).success,
    false,
  );
});

test("parses safe Super Admin lead filters", () => {
  assert.deepEqual(
    parseLeadListFilters({
      search: ["example.com", "ignored"],
      requestedService: "full-report",
      source: "public-audit",
      page: "3",
    }),
    {
      search: "example.com",
      requestedService: "full-report",
      source: "public-audit",
      page: 3,
    },
  );
  assert.deepEqual(
    parseLeadListFilters({ requestedService: "invalid", page: "-2" }),
    { page: 1 },
  );
});
