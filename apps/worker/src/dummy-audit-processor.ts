import { AuditProcessingError } from "@website-audit/audit-core";
import { AuditStatus } from "@website-audit/database";

import type { AuditProcessor } from "./audit-worker.js";

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
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

/** Lifecycle-only processor. It performs no HTTP requests and no crawling. */
export const runDummyAudit: AuditProcessor = async (context, tools) => {
  if (!context.websiteUrl) {
    throw new AuditProcessingError("The audit website URL is unavailable.", {
      retryable: false,
    });
  }

  const steps = [
    { progress: 10, message: "Validating the saved audit configuration." },
    { progress: 35, message: "Preparing the audit lifecycle." },
    { progress: 65, message: "Verifying worker progress synchronization." },
    { progress: 90, message: "Finalizing the lifecycle-only audit." },
  ] as const;

  for (const step of steps) {
    await wait(100, tools.signal);
    await tools.updateProgress({
      ...step,
      currentStage: AuditStatus.INITIALIZING,
      pagesDiscovered: 0,
      pagesCrawled: 0,
    });
  }
};
