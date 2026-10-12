import {
  disconnectFromDatabase,
  recordWorkerHeartbeat,
  stopWorkerHeartbeat,
  WORKER_HEARTBEAT_INTERVAL_MS,
} from "@website-audit/database";

import { registerAuditWorker } from "./audit-worker.js";
import { runSeoAudit } from "./seo-audit-processor.js";
import { createStructuredLogger } from "./structured-logger.js";
import { getWorkerEnvironment } from "./environment.js";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
getWorkerEnvironment();
const logger = createStructuredLogger({ service: "audit-worker" });
const worker = registerAuditWorker({ processor: runSeoAudit, logger });
let shutdownPromise: Promise<void> | null = null;
async function publishHeartbeat(): Promise<void> {
  try {
    await recordWorkerHeartbeat(worker.workerId);
  } catch (error) {
    logger("error", "worker.heartbeat_failed", {
      workerId: worker.workerId,
      error,
    });
  }
}
const heartbeatTimer = setInterval(() => {
  void publishHeartbeat();
}, WORKER_HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();
await publishHeartbeat();

function shutDown(signal: (typeof shutdownSignals)[number]): void {
  logger("info", "worker.shutdown_requested", { signal });
  shutdownPromise ??= worker.shutdown();
}

for (const signal of shutdownSignals) {
  process.once(signal, () => shutDown(signal));
}

try {
  await worker.done;
  if (shutdownPromise) await shutdownPromise;
} finally {
  clearInterval(heartbeatTimer);
  try {
    await stopWorkerHeartbeat(worker.workerId);
  } catch (error) {
    logger("error", "worker.heartbeat_shutdown_failed", {
      workerId: worker.workerId,
      error,
    });
  }
  await disconnectFromDatabase();
}
