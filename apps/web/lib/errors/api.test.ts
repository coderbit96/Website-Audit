import assert from "node:assert/strict";
import test from "node:test";

import { RateLimitError, ValidationError } from "@website-audit/shared";

import { applicationErrorResponse, errorCode } from "./api.js";

test("serializes expected API errors without a stack trace", async () => {
  const response = applicationErrorResponse(
    new ValidationError("A website URL is required."),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "A website URL is required.",
    code: "VALIDATION_ERROR",
  });
});

test("sets Retry-After only for standardized rate limit errors", () => {
  const response = applicationErrorResponse(new RateLimitError(2.1));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "3");
});

test("maps unknown route failures to a generic internal error", async () => {
  const response = applicationErrorResponse(
    new Error("database password=not-for-the-client"),
  );

  assert.equal(errorCode(new Error("unexpected")), "INTERNAL_ERROR");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Something went wrong. Please try again.",
    code: "INTERNAL_ERROR",
  });
});
