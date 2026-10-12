import assert from "node:assert/strict";
import test from "node:test";

import { authenticatedDestination } from "./destination";

test("authentication returns to a valid public audit only", () => {
  const token = "a".repeat(43);
  assert.equal(authenticatedDestination(token), `/audit/${token}`);
  assert.equal(authenticatedDestination(), "/account");
  assert.equal(authenticatedDestination("../admin"), "/account");
  assert.equal(authenticatedDestination("https://evil.example"), "/account");
  assert.equal(authenticatedDestination("too-short"), "/account");
});
