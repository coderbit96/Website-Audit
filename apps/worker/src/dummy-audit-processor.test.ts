import assert from "node:assert/strict";
import test from "node:test";

import { AuditType } from "@website-audit/database";

import { runDummyAudit } from "./dummy-audit-processor.js";

const context = {
  auditId: "507f1f77bcf86cd799439011",
  jobId: "507f1f77bcf86cd799439012",
  attempt: 1,
  maxAttempts: 3,
  workspaceId: "507f1f77bcf86cd799439013",
  websiteId: "507f1f77bcf86cd799439014",
  websiteName: "Example",
  websiteUrl: "https://example.com/",
  auditType: AuditType.FULL_SITE,
  configuration: null,
} as const;

test("dummy processor reports honest lifecycle progress without crawling", async () => {
  const progress: Array<{
    progress: number;
    pagesDiscovered: number;
    pagesCrawled: number;
  }> = [];
  await runDummyAudit(context, {
    signal: new AbortController().signal,
    log() {},
    updateProgress(value) {
      progress.push({
        progress: value.progress,
        pagesDiscovered: value.pagesDiscovered,
        pagesCrawled: value.pagesCrawled,
      });
      return Promise.resolve();
    },
  });

  assert.deepEqual(
    progress.map((entry) => entry.progress),
    [10, 35, 65, 90],
  );
  assert.ok(
    progress.every(
      (entry) => entry.pagesDiscovered === 0 && entry.pagesCrawled === 0,
    ),
  );
});

test("dummy processor stops when aborted", async () => {
  const controller = new AbortController();
  controller.abort(new Error("stop"));

  await assert.rejects(
    runDummyAudit(context, {
      signal: controller.signal,
      log() {},
      updateProgress() {
        return Promise.resolve();
      },
    }),
    /stop/,
  );
});
