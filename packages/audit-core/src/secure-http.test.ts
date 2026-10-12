import assert from "node:assert/strict";
import test from "node:test";

import {
  SecureHttpError,
  shouldReadResponseBody,
  withRequestDeadline,
} from "./secure-http.js";

test("bounds a request that keeps making progress beyond its total deadline", async () => {
  let operationAborted = false;
  let progressTicks = 0;
  await assert.rejects(
    withRequestDeadline(
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          progressTicks += 1;
          const activity = setInterval(() => {
            progressTicks += 1;
          }, 5);
          signal.addEventListener(
            "abort",
            () => {
              clearInterval(activity);
              operationAborted = true;
              reject(signal.reason);
            },
            { once: true },
          );
        }),
      20,
    ),
    (error: unknown) =>
      error instanceof SecureHttpError && error.code === "REQUEST_TIMEOUT",
  );
  assert.equal(operationAborted, true);
  assert.ok(progressTicks > 0);
});

test("preserves explicit cancellation rather than reporting a timeout", async () => {
  const controller = new AbortController();
  const pending = withRequestDeadline(
    () => new Promise<void>(() => undefined),
    1_000,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof SecureHttpError && error.code === "ABORTED",
  );
});

test("skips binary and redirect bodies but retains HTML and unknown types", () => {
  const base = {
    statusCode: 200,
    method: "GET" as const,
    skipNonHtmlBody: true,
  };
  assert.equal(
    shouldReadResponseBody({ ...base, contentType: "application/pdf" }),
    false,
  );
  assert.equal(
    shouldReadResponseBody({ ...base, contentType: "image/png" }),
    false,
  );
  assert.equal(
    shouldReadResponseBody({
      ...base,
      contentType: "text/html; charset=utf-8",
    }),
    true,
  );
  assert.equal(
    shouldReadResponseBody({ ...base, contentType: undefined }),
    true,
  );
  assert.equal(
    shouldReadResponseBody({
      ...base,
      contentType: "text/html",
      statusCode: 302,
    }),
    false,
  );
  assert.equal(
    shouldReadResponseBody({
      ...base,
      contentType: "text/html",
      method: "HEAD",
    }),
    false,
  );
});
