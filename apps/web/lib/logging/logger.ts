import { randomUUID } from "node:crypto";

import {
  createStructuredLogger,
  type StructuredLogFields,
} from "@website-audit/shared";

export const webLogger = createStructuredLogger({ service: "web" });

function safeRequestId(value: string | null): string {
  if (value && /^[a-zA-Z0-9_.:-]{8,100}$/.test(value)) return value;
  return randomUUID();
}

export function requestLogContext(request: Request): StructuredLogFields & {
  requestId: string;
  method: string;
  path: string;
} {
  let path = "/unknown";
  try {
    path = new URL(request.url).pathname.slice(0, 500);
  } catch {
    // The Request implementation normally guarantees a valid URL.
  }
  return {
    requestId: safeRequestId(request.headers.get("x-request-id")),
    method: request.method,
    path,
  };
}

export function logSecurityRejection(
  request: Request,
  reason: string,
  fields: StructuredLogFields = {},
): void {
  webLogger("warn", "security.request_rejected", {
    ...requestLogContext(request),
    reason,
    ...fields,
  });
}
