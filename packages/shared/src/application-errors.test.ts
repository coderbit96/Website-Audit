import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  AuditError,
  ConflictError,
  CrawlerError,
  ExternalServiceError,
  NotFoundError,
  PlanLimitError,
  RateLimitError,
  toSafeErrorPayload,
  ValidationError,
} from "./application-errors.js";

test("maps standardized expected errors to safe, stable API payloads", () => {
  const cases = [
    [new ValidationError(), 400, "VALIDATION_ERROR"],
    [new AuthenticationError(), 401, "AUTHENTICATION_ERROR"],
    [new AuthorizationError(), 403, "AUTHORIZATION_ERROR"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "CONFLICT"],
    [new PlanLimitError(), 403, "PLAN_LIMIT_REACHED"],
    [new AuditError(), 422, "AUDIT_ERROR"],
    [new CrawlerError(), 422, "CRAWLER_ERROR"],
    [new ExternalServiceError(), 503, "EXTERNAL_SERVICE_ERROR"],
  ] as const;

  for (const [error, status, code] of cases) {
    const result = toSafeErrorPayload(error);
    assert.equal(error instanceof ApplicationError, true);
    assert.equal(result.status, status);
    assert.equal(result.payload.code, code);
    assert.equal(result.payload.error.length > 0, true);
  }
});

test("rate limit errors retain a bounded Retry-After value", () => {
  const result = toSafeErrorPayload(new RateLimitError(1.2));
  assert.equal(result.status, 429);
  assert.equal(result.payload.code, "RATE_LIMITED");
  assert.equal(result.retryAfterSeconds, 2);
});

test("unexpected errors never expose their message, stack, or cause", () => {
  const error = new Error("mongodb://secret-user:secret-password@internal");
  const result = toSafeErrorPayload(error);

  assert.deepEqual(result, {
    status: 500,
    payload: {
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    },
    retryAfterSeconds: null,
  });
});
