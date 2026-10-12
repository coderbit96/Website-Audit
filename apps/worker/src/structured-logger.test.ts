import assert from "node:assert/strict";
import test from "node:test";

import { createStructuredLogger } from "./structured-logger.js";

test("emits bounded structured logs without URL credentials", () => {
  const lines: string[] = [];
  const logger = createStructuredLogger({
    service: "worker",
    environment: "test",
    writer: (_level, line) => lines.push(line),
    now: () => new Date("2026-01-02T03:04:05.000Z"),
  });

  logger("warn", "audit.optional unavailable", {
    auditId: "audit-1",
    message: "Failed https://admin:secret@example.com/path",
  });

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.equal(entry.timestamp, "2026-01-02T03:04:05.000Z");
  assert.equal(entry.level, "warn");
  assert.equal(entry.service, "worker");
  assert.equal(entry.event, "audit.optional_unavailable");
  assert.equal(entry.auditId, "audit-1");
  assert.doesNotMatch(String(entry.message), /secret/);
});
