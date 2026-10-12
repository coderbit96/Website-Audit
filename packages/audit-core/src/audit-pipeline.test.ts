import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_PIPELINE_PROGRESS,
  AuditProgressGuard,
  AuditProgressOrderError,
  calculateCrawlProgress,
} from "./audit-pipeline.js";

test("maps bounded crawl progress into the crawler portion of the pipeline", () => {
  assert.equal(calculateCrawlProgress(0, 100), 12);
  assert.equal(calculateCrawlProgress(50, 100), 33);
  assert.equal(calculateCrawlProgress(100, 100), 55);
  assert.equal(calculateCrawlProgress(500, 100), 55);
  assert.equal(calculateCrawlProgress(1, 0), 55);
});

test("keeps pipeline progress and lifecycle stages monotonic", () => {
  const guard = new AuditProgressGuard({
    initialProgress: 1,
    initialStage: "INITIALIZING",
    orderedStages: ["INITIALIZING", "CRAWLING", "ANALYZING", "SCORING"],
  });

  guard.accept({ progress: 3, stage: "INITIALIZING" });
  guard.accept({
    progress: AUDIT_PIPELINE_PROGRESS.CRAWLING_START,
    stage: "CRAWLING",
  });
  guard.accept({ progress: 60, stage: "ANALYZING" });
  assert.throws(
    () => guard.accept({ progress: 59, stage: "ANALYZING" }),
    AuditProgressOrderError,
  );
  assert.throws(
    () => guard.accept({ progress: 61, stage: "CRAWLING" }),
    AuditProgressOrderError,
  );
});
