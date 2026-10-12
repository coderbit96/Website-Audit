import assert from "node:assert/strict";
import test from "node:test";

import { createStructuredLogger } from "./structured-logger.js";

test("emits correlated JSON logs with stable service fields", () => {
  const lines: string[] = [];
  const logger = createStructuredLogger({
    service: "worker",
    environment: "test",
    writer: (_level, line) => lines.push(line),
    now: () => new Date("2026-01-02T03:04:05.000Z"),
  });

  logger("warn", "audit optional unavailable", {
    auditId: "audit-1",
    jobId: "job-1",
  });

  const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.equal(entry.timestamp, "2026-01-02T03:04:05.000Z");
  assert.equal(entry.service, "worker");
  assert.equal(entry.environment, "test");
  assert.equal(entry.event, "audit_optional_unavailable");
  assert.equal(entry.auditId, "audit-1");
  assert.equal(entry.jobId, "job-1");
});

test("recursively redacts credentials, tokens, cookies, and URL queries", () => {
  const lines: string[] = [];
  const logger = createStructuredLogger({
    service: "web",
    writer: (_level, line) => lines.push(line),
  });

  logger("error", "request.failed", {
    password: "Password-123",
    nested: {
      apiKey: "api-key-value",
      sessionToken: "session-value",
      cookie: "session=private-cookie",
    },
    targetUrl:
      "https://admin:private@example.com/path?token=query-secret&view=full#section",
    error: new Error(
      "Bearer bearer-secret https://user:uri-secret@example.com/path?api_key=query-key",
    ),
  });

  assert.equal(lines.length, 1);
  const line = lines[0] ?? "";
  assert.doesNotMatch(
    line,
    /Password-123|api-key-value|session-value|private-cookie|query-secret|uri-secret|bearer-secret|query-key/,
  );
  const entry = JSON.parse(line) as Record<string, unknown>;
  assert.equal(entry.password, "[REDACTED]");
  assert.equal(entry.targetUrl, "https://example.com/path");
});

test("logging failures never interrupt application work", () => {
  const logger = createStructuredLogger({
    service: "web",
    writer: () => {
      throw new Error("destination unavailable");
    },
  });

  assert.doesNotThrow(() => logger("info", "web.started"));
});
