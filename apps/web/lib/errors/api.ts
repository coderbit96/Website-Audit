import {
  toSafeErrorPayload,
  type ApplicationErrorCode,
} from "@website-audit/shared";
import { NextResponse } from "next/server";

import { webLogger } from "../logging/logger";

/** Logs bounded server diagnostics through the shared redaction boundary. */
export function logServerError(
  operation: string,
  error: unknown,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  webLogger("error", "web.request_failed", {
    operation,
    ...fields,
    error,
  });
}

export function applicationErrorResponse(
  error: unknown,
  options: { operation?: string; headers?: HeadersInit } = {},
): NextResponse {
  const result = toSafeErrorPayload(error);
  if (result.payload.code === "INTERNAL_ERROR" && options.operation) {
    logServerError(options.operation, error);
  }
  if (
    result.payload.code === "AUTHENTICATION_ERROR" ||
    result.payload.code === "AUTHORIZATION_ERROR"
  ) {
    webLogger("warn", "security.authorization_rejected", {
      operation: options.operation,
      code: result.payload.code,
      status: result.status,
    });
  }

  const headers = new Headers(options.headers);
  if (result.retryAfterSeconds !== null) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  const hasHeaders =
    Boolean(options.headers) || result.retryAfterSeconds !== null;

  return NextResponse.json(result.payload, {
    status: result.status,
    ...(hasHeaders ? { headers } : {}),
  });
}

export function errorCode(
  error: unknown,
): ApplicationErrorCode | "INTERNAL_ERROR" {
  return toSafeErrorPayload(error).payload.code;
}
