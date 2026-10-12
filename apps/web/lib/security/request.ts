import { NextResponse } from "next/server";

import { logSecurityRejection } from "../logging/logger";

function configuredApplicationOrigins(request: Request): Set<string> {
  const origins = new Set<string>([new URL(request.url).origin]);

  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL]) {
    if (!value) continue;

    try {
      origins.add(new URL(value).origin);
    } catch {
      // Invalid optional configuration must not turn a cross-origin request
      // into a trusted one. Configuration validation happens at startup.
    }
  }

  return origins;
}

/**
 * Reject browser-initiated cross-site mutations before processing request
 * data. Requests without an Origin header are permitted for trusted
 * server-to-server clients; browser requests include Origin for these APIs.
 */
export function mutationOriginResponse(request: Request): NextResponse | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    logSecurityRejection(request, "cross_site_fetch");
    return NextResponse.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (!origin || configuredApplicationOrigins(request).has(origin)) {
    return null;
  }

  logSecurityRejection(request, "untrusted_origin");
  return NextResponse.json(
    { error: "Cross-site requests are not allowed." },
    { status: 403 },
  );
}

type JsonBodyResult =
  | { body: unknown; response?: never }
  | { body?: never; response: NextResponse };

function jsonError(
  error: string,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    { error },
    headers ? { headers, status } : { status },
  );
}

/** Reads a JSON body without accepting an unbounded stream into memory. */
export async function readBoundedJsonBody(
  request: Request,
  maximumBytes = 16_384,
  headers?: HeadersInit,
): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    logSecurityRejection(request, "request_body_too_large", {
      declaredBytes: declaredLength,
      maximumBytes,
    });
    return {
      response: jsonError("The request is too large.", 413, headers),
    };
  }

  if (!request.body) {
    return {
      response: jsonError("Request body must be valid JSON.", 400, headers),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        logSecurityRejection(request, "request_body_too_large", {
          receivedBytes,
          maximumBytes,
        });
        await reader.cancel();
        return {
          response: jsonError("The request is too large.", 413, headers),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      response: jsonError("Request body could not be read.", 400, headers),
    };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return {
      response: jsonError("Request body must be valid JSON.", 400, headers),
    };
  }
}
