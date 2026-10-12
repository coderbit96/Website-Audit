import assert from "node:assert/strict";
import test from "node:test";

import { AuditProcessingError } from "@website-audit/audit-core";
import { AuditStatus, AuditType } from "@website-audit/database";

import {
  registerAuditWorker,
  type AuditProcessor,
  type AuditWorkerRepositories,
} from "./audit-worker.js";

const claim = {
  auditId: "507f1f77bcf86cd799439011",
  jobId: "507f1f77bcf86cd799439012",
  attempt: 1,
  maxAttempts: 3,
} as const;

const context = {
  ...claim,
  workspaceId: "507f1f77bcf86cd799439013",
  websiteId: "507f1f77bcf86cd799439014",
  websiteName: "Example",
  websiteUrl: "https://example.com/",
  auditType: AuditType.STANDARD,
  configuration: null,
} as const;

function completionSignal<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, milliseconds = 2_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for the worker test.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("processes one queued audit through every lifecycle stage", async () => {
  let claimed = false;
  const updates: Array<{ progress: number; stage: string }> = [];
  const logs: string[] = [];
  const completed = completionSignal<void>();
  let failed = false;

  const repositories = {
    claimNextAuditJob() {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve(claim);
    },
    loadClaimedAuditContext() {
      return Promise.resolve(context);
    },
    updateAuditJobProgress(input) {
      updates.push({ progress: input.progress, stage: input.currentStage });
      return Promise.resolve(true);
    },
    completeAuditJob() {
      completed.resolve();
      return Promise.resolve(true);
    },
    failAuditJob() {
      failed = true;
      completed.resolve();
      return Promise.resolve("failed" as const);
    },
    releaseAuditJobForShutdown() {
      return Promise.resolve();
    },
  } satisfies Partial<AuditWorkerRepositories>;

  const processor: AuditProcessor = async (_audit, tools) => {
    const checkpoints = [
      [3, AuditStatus.INITIALIZING],
      [7, AuditStatus.INITIALIZING],
      [12, AuditStatus.CRAWLING],
      [55, AuditStatus.CRAWLING],
      [60, AuditStatus.ANALYZING],
      [65, AuditStatus.ANALYZING],
      [70, AuditStatus.ANALYZING],
      [75, AuditStatus.ANALYZING],
      [80, AuditStatus.ANALYZING],
      [85, AuditStatus.ANALYZING],
      [91, AuditStatus.SCORING],
      [96, AuditStatus.GENERATING_REPORT],
      [99, AuditStatus.GENERATING_REPORT],
    ] as const;

    for (const [progress, currentStage] of checkpoints) {
      await tools.updateProgress({
        progress,
        currentStage,
        pagesDiscovered: progress >= 12 ? 4 : 1,
        pagesCrawled: progress >= 55 ? 4 : progress >= 12 ? 1 : 0,
        message: `Pipeline checkpoint ${progress}.`,
      });
    }
  };

  const worker = registerAuditWorker({
    processor,
    pollIntervalMs: 1,
    recoverStalledJobs: false,
    workerId: "test-worker",
    repositories,
    logger(_level, event) {
      logs.push(event);
    },
  });

  await within(completed.promise);
  await worker.shutdown();

  assert.equal(failed, false);
  assert.deepEqual(
    updates.map((update) => update.progress),
    [3, 7, 12, 55, 60, 65, 70, 75, 80, 85, 91, 96, 99],
  );
  assert.deepEqual(
    [...new Set(updates.map((update) => update.stage))],
    [
      AuditStatus.INITIALIZING,
      AuditStatus.CRAWLING,
      AuditStatus.ANALYZING,
      AuditStatus.SCORING,
      AuditStatus.GENERATING_REPORT,
    ],
  );
  assert.ok(logs.includes("audit.claimed"));
  assert.ok(logs.includes("audit.completed"));
  assert.ok(logs.includes("worker.shutdown_completed"));
});

test("passes safe failure diagnostics and the active stage to persistence", async () => {
  let claimed = false;
  const failure = completionSignal<{
    code: string;
    stage: string;
    step: string | undefined;
    message: string;
  }>();

  const repositories = {
    claimNextAuditJob() {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve(claim);
    },
    loadClaimedAuditContext() {
      return Promise.resolve(context);
    },
    failAuditJob(input) {
      failure.resolve({
        code: input.failureCode,
        stage: input.failureStage,
        step: input.failureStep,
        message: input.safeError,
      });
      return Promise.resolve("failed" as const);
    },
    releaseAuditJobForShutdown() {
      return Promise.resolve();
    },
  } satisfies Partial<AuditWorkerRepositories>;

  const worker = registerAuditWorker({
    processor: async (_audit, tools) => {
      await tools.updateProgress({
        progress: 75,
        currentStage: AuditStatus.ANALYZING,
        pagesDiscovered: 4,
        pagesCrawled: 4,
        message: "Checking security.",
      });
      throw new AuditProcessingError("Security analysis failed safely.", {
        retryable: false,
        code: "SECURITY_ANALYSIS_FAILED",
        stage: AuditStatus.ANALYZING,
        step: "SECURITY",
      });
    },
    pollIntervalMs: 1,
    recoverStalledJobs: false,
    workerId: "failure-test-worker",
    repositories: {
      ...repositories,
      updateAuditJobProgress: () => Promise.resolve(true),
    },
    logger() {},
  });

  const recorded = await within(failure.promise);
  await worker.shutdown();

  assert.deepEqual(recorded, {
    code: "SECURITY_ANALYSIS_FAILED",
    stage: AuditStatus.ANALYZING,
    step: "SECURITY",
    message: "Security analysis failed safely.",
  });
});

test("renews the claimed lease while a stage runs longer than the stale window", async () => {
  let claimed = false;
  let renewals = 0;
  let failed = false;
  const completed = completionSignal<void>();
  const worker = registerAuditWorker({
    processor: async () => {
      await new Promise((resolve) => setTimeout(resolve, 110));
    },
    pollIntervalMs: 1,
    staleAfterMs: 60,
    recoverStalledJobs: false,
    workerId: "heartbeat-test-worker",
    repositories: {
      claimNextAuditJob: () => {
        if (claimed) return Promise.resolve(null);
        claimed = true;
        return Promise.resolve(claim);
      },
      loadClaimedAuditContext: () => Promise.resolve(context),
      renewAuditJobLease: () => {
        renewals += 1;
        return Promise.resolve(true);
      },
      completeAuditJob: () => {
        completed.resolve();
        return Promise.resolve(true);
      },
      failAuditJob: () => {
        failed = true;
        completed.resolve();
        return Promise.resolve("failed" as const);
      },
    },
    logger() {},
  });

  await within(completed.promise);
  await worker.shutdown();
  assert.equal(failed, false);
  assert.ok(renewals >= 2);
});

test("stops processing when lease renewal says another worker owns the job", async () => {
  let claimed = false;
  let completed = false;
  const failed = completionSignal<string>();
  const worker = registerAuditWorker({
    processor: async (_context, tools) => {
      await new Promise<void>((_resolve, reject) => {
        tools.signal.addEventListener(
          "abort",
          () => reject(tools.signal.reason),
          { once: true },
        );
      });
    },
    pollIntervalMs: 1,
    staleAfterMs: 60,
    recoverStalledJobs: false,
    workerId: "lost-lease-test-worker",
    repositories: {
      claimNextAuditJob: () => {
        if (claimed) return Promise.resolve(null);
        claimed = true;
        return Promise.resolve(claim);
      },
      loadClaimedAuditContext: () => Promise.resolve(context),
      renewAuditJobLease: () => Promise.resolve(false),
      completeAuditJob: () => {
        completed = true;
        return Promise.resolve(true);
      },
      failAuditJob: ({ failureCode }) => {
        failed.resolve(failureCode);
        return Promise.resolve("ignored" as const);
      },
    },
    logger() {},
  });

  assert.equal(await within(failed.promise), "WORKER_LEASE_LOST");
  await worker.shutdown();
  assert.equal(completed, false);
});
