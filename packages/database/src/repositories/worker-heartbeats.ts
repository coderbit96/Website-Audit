import { connectToDatabase } from "../connection.js";
import { WorkerHeartbeatModel } from "../models.js";

export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const WORKER_HEALTH_WINDOW_MS = 90_000;

export async function recordWorkerHeartbeat(workerId: string): Promise<void> {
  if (!workerId.trim()) throw new Error("Worker identifier is required.");
  await connectToDatabase();
  const now = new Date();
  await WorkerHeartbeatModel.updateOne(
    { workerId },
    {
      $set: { state: "RUNNING", lastSeenAt: now },
      $setOnInsert: { startedAt: now },
      $unset: { stoppedAt: 1 },
    },
    { upsert: true },
  ).exec();
}

export async function stopWorkerHeartbeat(workerId: string): Promise<void> {
  await connectToDatabase();
  const now = new Date();
  await WorkerHeartbeatModel.updateOne(
    { workerId },
    { $set: { state: "STOPPED", lastSeenAt: now, stoppedAt: now } },
  ).exec();
}

export async function countHealthyWorkers(now = new Date()): Promise<number> {
  await connectToDatabase();
  return WorkerHeartbeatModel.countDocuments({
    state: "RUNNING",
    lastSeenAt: { $gte: new Date(now.getTime() - WORKER_HEALTH_WINDOW_MS) },
  }).exec();
}
