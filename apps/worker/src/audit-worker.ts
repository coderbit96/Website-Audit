import {
  AuditPipelineStep,
  AuditProgressGuard,
  AuditProcessingError,
  calculateAuditRetryDelay,
  DEFAULT_AUDIT_POLL_INTERVAL_MS,
  DEFAULT_AUDIT_STALE_AFTER_MS,
  DEFAULT_AUDIT_TIMEOUT_MS,
  getSafeAuditFailure,
} from "@website-audit/audit-core";
import {
  AuditStatus,
  claimNextAuditJob,
  completeAuditJob,
  failAuditJob,
  loadClaimedAuditContext,
  recoverStalledAuditJobs,
  renewAuditJobLease,
  releaseAuditJobForShutdown,
  updateAuditJobProgress,
  type ClaimedAuditContext,
  type ClaimedAuditJob,
  type AuditStatus as AuditLifecycleState,
} from "@website-audit/database";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import {
  createStructuredLogger,
  type StructuredLogFields,
  type StructuredLogLevel,
  type StructuredLogger,
} from "./structured-logger.js";

const orderedActiveStages = [
  AuditStatus.INITIALIZING,
  AuditStatus.CRAWLING,
  AuditStatus.ANALYZING,
  AuditStatus.SCORING,
  AuditStatus.GENERATING_REPORT,
] as const;
const pipelineSteps = new Set<string>(Object.values(AuditPipelineStep));

function fallbackPipelineStep(stage: AuditLifecycleState): string {
  if (stage === AuditStatus.CRAWLING) return AuditPipelineStep.CRAWLING;
  if (stage === AuditStatus.SCORING) return AuditPipelineStep.SCORING;
  if (stage === AuditStatus.GENERATING_REPORT)
    return AuditPipelineStep.PERSISTING;
  return AuditPipelineStep.URL_VALIDATION;
}

export type AuditProcessorTools = {
  signal: AbortSignal;
  log: (
    level: StructuredLogLevel,
    event: string,
    fields?: StructuredLogFields,
  ) => void;
  updateProgress: (update: {
    progress: number;
    currentStage: AuditLifecycleState;
    pagesDiscovered: number;
    pagesCrawled: number;
    message: string;
  }) => Promise<void>;
};

export type AuditWorkerRepositories = {
  claimNextAuditJob: typeof claimNextAuditJob;
  completeAuditJob: typeof completeAuditJob;
  failAuditJob: typeof failAuditJob;
  loadClaimedAuditContext: typeof loadClaimedAuditContext;
  recoverStalledAuditJobs: typeof recoverStalledAuditJobs;
  renewAuditJobLease: typeof renewAuditJobLease;
  releaseAuditJobForShutdown: typeof releaseAuditJobForShutdown;
  updateAuditJobProgress: typeof updateAuditJobProgress;
};

export type AuditProcessor = (
  context: ClaimedAuditContext,
  tools: AuditProcessorTools,
) => Promise<void>;

export type AuditWorkerOptions = {
  processor: AuditProcessor;
  pollIntervalMs?: number;
  timeoutMs?: number;
  staleAfterMs?: number;
  recoverStalledJobs?: boolean;
  logger?: StructuredLogger;
  repositories?: Partial<AuditWorkerRepositories>;
  workerId?: string;
};

export type AuditWorkerHandle = {
  workerId: string;
  done: Promise<void>;
  shutdown: () => Promise<void>;
};

class WorkerShutdownError extends Error {
  constructor() {
    super("Audit worker is shutting down.");
    this.name = "WorkerShutdownError";
  }
}

function waitForDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createAbortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

export function registerAuditWorker(
  options: AuditWorkerOptions,
): AuditWorkerHandle {
  const workerId =
    options.workerId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const log =
    options.logger ?? createStructuredLogger({ service: "audit-worker" });
  const repositories: AuditWorkerRepositories = {
    claimNextAuditJob,
    completeAuditJob,
    failAuditJob,
    loadClaimedAuditContext,
    recoverStalledAuditJobs,
    renewAuditJobLease,
    releaseAuditJobForShutdown,
    updateAuditJobProgress,
    ...options.repositories,
  };
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_AUDIT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUDIT_TIMEOUT_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_AUDIT_STALE_AFTER_MS;
  const stopController = new AbortController();
  let activeController: AbortController | null = null;
  let activeClaim: ClaimedAuditJob | null = null;
  let lastRecoveryAt = 0;

  async function processClaim(claim: ClaimedAuditJob): Promise<void> {
    activeClaim = claim;
    let currentStage: AuditLifecycleState = AuditStatus.INITIALIZING;
    let currentProgress = 1;
    const progressGuard = new AuditProgressGuard<AuditLifecycleState>({
      initialProgress: currentProgress,
      initialStage: currentStage,
      orderedStages: orderedActiveStages,
    });

    try {
      const context = await repositories.loadClaimedAuditContext(
        claim,
        workerId,
      );
      if (stopController.signal.aborted) {
        await repositories.releaseAuditJobForShutdown({
          auditId: claim.auditId,
          workerId,
          attempt: claim.attempt,
        });
        return;
      }

      if (!context) {
        log("error", "queue.audit_context_unavailable", {
          auditId: claim.auditId,
          jobId: claim.jobId,
          workerId,
          attempt: claim.attempt,
        });
        await repositories.failAuditJob({
          auditId: claim.auditId,
          workerId,
          failureCode: "AUDIT_CONTEXT_UNAVAILABLE",
          failureStage: currentStage,
          failureStep: AuditPipelineStep.URL_VALIDATION,
          safeError: "The authoritative audit information is unavailable.",
          retryable: false,
          retryDelayMs: 0,
        });
        return;
      }

      const controller = new AbortController();
      activeController = controller;
      const heartbeatIntervalMs = Math.max(
        10,
        Math.min(Math.floor(staleAfterMs / 3), 15_000),
      );
      let heartbeatStopped = false;
      let heartbeatInFlight: Promise<void> | null = null;
      const heartbeat = setInterval(() => {
        if (heartbeatStopped || heartbeatInFlight || controller.signal.aborted)
          return;
        heartbeatInFlight = (async () => {
          try {
            const renewed = await repositories.renewAuditJobLease({
              auditId: claim.auditId,
              jobId: claim.jobId,
              workerId,
            });
            if (!heartbeatStopped && !renewed) {
              controller.abort(
                new AuditProcessingError("The audit worker lease was lost.", {
                  retryable: false,
                  code: "WORKER_LEASE_LOST",
                  stage: currentStage,
                  step: fallbackPipelineStep(currentStage),
                }),
              );
            }
          } catch (error) {
            log("error", "queue.lease_renewal_failed", {
              auditId: claim.auditId,
              jobId: claim.jobId,
              error,
            });
            if (!heartbeatStopped) {
              controller.abort(
                new AuditProcessingError(
                  "The audit worker lease could not be renewed.",
                  {
                    retryable: true,
                    code: "WORKER_LEASE_RENEWAL_FAILED",
                    stage: currentStage,
                    step: fallbackPipelineStep(currentStage),
                  },
                ),
              );
            }
          }
        })().finally(() => {
          heartbeatInFlight = null;
        });
      }, heartbeatIntervalMs);
      heartbeat.unref();
      const timeout = setTimeout(() => {
        controller.abort(
          new AuditProcessingError("Audit processing timed out.", {
            retryable: true,
            code: "AUDIT_TIMEOUT",
            stage: currentStage,
            step: fallbackPipelineStep(currentStage),
          }),
        );
      }, timeoutMs);

      try {
        await Promise.race([
          options.processor(context, {
            signal: controller.signal,
            log(level, event, fields = {}) {
              log(level, event, {
                auditId: claim.auditId,
                jobId: claim.jobId,
                attempt: claim.attempt,
                ...fields,
              });
            },
            async updateProgress(update) {
              const progress = Math.max(
                1,
                Math.min(99, Math.round(update.progress)),
              );
              progressGuard.accept({
                progress,
                stage: update.currentStage,
              });
              const previousStage = currentStage;
              currentStage = update.currentStage;
              currentProgress = progress;
              const updated = await repositories.updateAuditJobProgress({
                auditId: claim.auditId,
                workerId,
                ...update,
                progress,
              });
              if (!updated) {
                throw new AuditProcessingError(
                  "Audit processing was cancelled or lost its worker lease.",
                  {
                    retryable: false,
                    code: "WORKER_LEASE_LOST",
                    stage: currentStage,
                    step: fallbackPipelineStep(currentStage),
                  },
                );
              }
              if (previousStage !== currentStage) {
                log("info", "audit.lifecycle_stage_changed", {
                  auditId: claim.auditId,
                  jobId: claim.jobId,
                  attempt: claim.attempt,
                  stage: currentStage,
                  progress: currentProgress,
                });
              }
            },
          }),
          createAbortPromise(controller.signal),
        ]);

        const completed = await repositories.completeAuditJob({
          auditId: claim.auditId,
          workerId,
        });
        if (!completed) {
          throw new AuditProcessingError(
            "Audit completion was rejected because the worker lease was lost.",
            {
              retryable: false,
              code: "AUDIT_COMPLETION_REJECTED",
              stage: currentStage,
              step: AuditPipelineStep.FINALIZING,
            },
          );
        }
        log("info", "audit.completed", {
          auditId: claim.auditId,
          jobId: claim.jobId,
          attempt: claim.attempt,
          progress: 100,
        });
      } catch (error) {
        if (
          stopController.signal.aborted ||
          error instanceof WorkerShutdownError
        ) {
          await repositories.releaseAuditJobForShutdown({
            auditId: claim.auditId,
            workerId,
            attempt: claim.attempt,
          });
          return;
        }

        const failure = getSafeAuditFailure(error);
        const failureStage = orderedActiveStages.includes(
          failure.stage as (typeof orderedActiveStages)[number],
        )
          ? (failure.stage as AuditLifecycleState)
          : currentStage;
        const failureStep =
          failure.step && pipelineSteps.has(failure.step)
            ? failure.step
            : fallbackPipelineStep(failureStage);
        const outcome = await repositories.failAuditJob({
          auditId: claim.auditId,
          workerId,
          failureCode: failure.code,
          failureStage,
          failureStep,
          safeError: failure.message,
          retryable: failure.retryable,
          retryDelayMs: calculateAuditRetryDelay(claim.attempt),
        });
        log(outcome === "ignored" ? "warn" : "error", "audit.failed", {
          auditId: claim.auditId,
          jobId: claim.jobId,
          attempt: claim.attempt,
          code: failure.code,
          stage: failureStage,
          step: failureStep,
          outcome,
          retryable: failure.retryable,
        });
      } finally {
        heartbeatStopped = true;
        clearInterval(heartbeat);
        if (heartbeatInFlight) await heartbeatInFlight;
        clearTimeout(timeout);
        activeController = null;
      }
    } finally {
      activeClaim = null;
    }
  }

  async function run(): Promise<void> {
    log("info", "worker.registered", { workerId });

    while (!stopController.signal.aborted) {
      try {
        const now = Date.now();
        if (
          options.recoverStalledJobs !== false &&
          now - lastRecoveryAt >= Math.max(staleAfterMs / 2, 5_000)
        ) {
          const recovered = await repositories.recoverStalledAuditJobs({
            staleBefore: new Date(now - staleAfterMs),
            retryDelayForAttempt: calculateAuditRetryDelay,
          });
          if (recovered > 0) {
            log("warn", "worker.stalled_jobs_recovered", {
              workerId,
              count: recovered,
            });
          }
          lastRecoveryAt = now;
        }

        const claim = await repositories.claimNextAuditJob(workerId);
        if (claim) {
          log("info", "audit.claimed", {
            workerId,
            auditId: claim.auditId,
            jobId: claim.jobId,
            attempt: claim.attempt,
            maxAttempts: claim.maxAttempts,
          });
          await processClaim(claim);
          continue;
        }
      } catch (error) {
        if (!stopController.signal.aborted) {
          log("error", "queue.operation_failed", { workerId, error });
        }
      }

      try {
        await waitForDelay(pollIntervalMs, stopController.signal);
      } catch {
        // Shutdown interrupts the poll delay immediately.
      }
    }

    if (activeClaim) {
      await repositories.releaseAuditJobForShutdown({
        auditId: activeClaim.auditId,
        workerId,
        attempt: activeClaim.attempt,
      });
    }
    log("info", "worker.shutdown_completed", { workerId });
  }

  const done = run();

  return {
    workerId,
    done,
    async shutdown() {
      if (!stopController.signal.aborted) {
        stopController.abort(new WorkerShutdownError());
        activeController?.abort(new WorkerShutdownError());
      }
      await done;
    },
  };
}
