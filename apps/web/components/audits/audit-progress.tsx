"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type {
  AuditApiError,
  AuditApiSuccess,
  AuditJobView,
  AuditLifecycleStatus,
} from "../../lib/audits/types";

const terminalStatuses = new Set<AuditLifecycleStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const statusLabels: Record<AuditLifecycleStatus, string> = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing",
  CRAWLING: "Crawling",
  ANALYZING: "Analyzing",
  SCORING: "Scoring",
  GENERATING_REPORT: "Generating report",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const lifecycleStages = [
  "QUEUED",
  "INITIALIZING",
  "CRAWLING",
  "ANALYZING",
  "SCORING",
  "GENERATING_REPORT",
] as const satisfies readonly AuditLifecycleStatus[];

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
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

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    AuditApiSuccess<T> | AuditApiError | null;
  if (!response.ok || !payload || !("data" in payload)) {
    throw new Error(
      payload && "error" in payload
        ? payload.error
        : "Audit progress could not be loaded.",
    );
  }
  return payload.data;
}

export function AuditProgress({
  initialAudit,
  websiteName,
  websiteUrl,
  canManage,
}: {
  initialAudit: AuditJobView;
  websiteName: string;
  websiteUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [pollError, setPollError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (terminalStatuses.has(initialAudit.status)) return;
    const controller = new AbortController();

    async function poll() {
      let currentStatus = initialAudit.status;

      try {
        while (
          !controller.signal.aborted &&
          !terminalStatuses.has(currentStatus)
        ) {
          await delay(600, controller.signal);
          const response = await fetch(
            `/api/audits/${initialAudit.auditId}/status`,
            { cache: "no-store", signal: controller.signal },
          );
          const current = await readResponse<AuditJobView>(response);
          currentStatus = current.status;
          setAudit(current);
          setPollError(null);
          if (current.status === "COMPLETED") router.refresh();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPollError(
            error instanceof Error
              ? error.message
              : "Audit progress could not be loaded.",
          );
        }
      }
    }

    void poll();
    return () => controller.abort();
  }, [initialAudit.auditId, initialAudit.status, router]);

  async function cancelAudit() {
    setCancelling(true);
    setPollError(null);
    try {
      const response = await fetch(`/api/audits/${audit.auditId}`, {
        method: "DELETE",
      });
      const result = await readResponse<{
        status: AuditLifecycleStatus;
        cancelled: boolean;
      }>(response);
      setAudit((current) => ({
        ...current,
        status: result.status,
        currentStage: result.status,
        message:
          result.status === "CANCELLED" ? "Audit cancelled." : current.message,
      }));
    } catch (error) {
      setPollError(
        error instanceof Error
          ? error.message
          : "Audit could not be cancelled.",
      );
    } finally {
      setCancelling(false);
    }
  }

  const isTerminal = terminalStatuses.has(audit.status);
  const currentStageIndex = lifecycleStages.indexOf(
    audit.currentStage as (typeof lifecycleStages)[number],
  );

  return (
    <div className="audit-progress-page">
      <Link className="website-back-link" href="/dashboard/audits">
        ← Back to audits
      </Link>

      <section className="audit-progress-heading">
        <div>
          <p className="page-eyebrow">Audit progress</p>
          <h1>{websiteName}</h1>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={websiteUrl}
            aria-label={`Open ${websiteUrl} in a new tab`}
          >
            {websiteUrl} ↗
          </a>
        </div>
        <span className="audit-status-badge" data-status={audit.status}>
          {statusLabels[audit.status]}
        </span>
      </section>

      {pollError ? (
        <p className="form-alert audit-poll-error" role="alert">
          {pollError}
        </p>
      ) : null}

      <section className="audit-progress-card" aria-live="polite">
        <div className="audit-progress-value-row">
          <div>
            <span>Current stage</span>
            <strong>{statusLabels[audit.currentStage]}</strong>
          </div>
          <b>{audit.progress}%</b>
        </div>
        <div
          className="audit-progress-track"
          role="progressbar"
          aria-label="Audit completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={audit.progress}
        >
          <span style={{ width: `${audit.progress}%` }} />
        </div>
        <ol className="audit-stage-list" aria-label="Audit lifecycle">
          {lifecycleStages.map((stage, index) => {
            const completed =
              audit.status === "COMPLETED" ||
              (currentStageIndex >= 0 && index < currentStageIndex);
            const current = !completed && stage === audit.currentStage;

            return (
              <li
                data-state={
                  completed ? "complete" : current ? "current" : "upcoming"
                }
                key={stage}
                aria-current={current ? "step" : undefined}
              >
                <span aria-hidden="true">{completed ? "✓" : index + 1}</span>
                <small>{statusLabels[stage]}</small>
              </li>
            );
          })}
        </ol>
        <p>{audit.message}</p>

        <div className="audit-progress-metrics">
          <article>
            <span>Pages discovered</span>
            <strong>{audit.pagesDiscovered}</strong>
          </article>
          <article>
            <span>Pages crawled</span>
            <strong>{audit.pagesCrawled}</strong>
          </article>
          <article>
            <span>Worker attempts</span>
            <strong>
              {audit.attempts} / {audit.maxAttempts}
            </strong>
          </article>
        </div>

        {!isTerminal && canManage ? (
          <button
            className="audit-progress-cancel"
            type="button"
            disabled={cancelling}
            onClick={() => void cancelAudit()}
          >
            {cancelling ? "Cancelling…" : "Cancel audit"}
          </button>
        ) : null}
      </section>

      <section className="audit-results-state" data-status={audit.status}>
        <h2>
          {audit.status === "COMPLETED"
            ? "Website audit completed"
            : audit.status === "FAILED"
              ? "Audit processing failed"
              : audit.status === "CANCELLED"
                ? "Audit cancelled"
                : "Results are not ready"}
        </h2>
        <p>
          {audit.failureReason ??
            (audit.status === "COMPLETED"
              ? "Real page records, findings, metrics, and deterministic scores were saved. The detailed report interface will be added in a later stage."
              : "No score is generated while the audit is still running.")}
        </p>
        {audit.status === "FAILED" && canManage ? (
          <Link
            className="audit-progress-retry"
            href={`/dashboard/audits/new?websiteId=${encodeURIComponent(audit.websiteId)}`}
          >
            Create a retry audit
          </Link>
        ) : null}
      </section>
    </div>
  );
}
