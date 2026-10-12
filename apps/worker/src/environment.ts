import {
  parseWorkerEnvironment,
  type WorkerEnvironment,
} from "@website-audit/shared/environment/server";

let cachedEnvironment: WorkerEnvironment | null = null;

export function getWorkerEnvironment(): WorkerEnvironment {
  cachedEnvironment ??= parseWorkerEnvironment(process.env);
  return cachedEnvironment;
}
