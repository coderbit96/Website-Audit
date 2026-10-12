import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

import {
  isPublicIpAddress,
  validatePublicHttpUrl,
  validateRedirectDestination,
  type DnsLookupAddress,
  type ValidatedPublicUrl,
} from "./url-security.js";

export const AUDIT_USER_AGENT =
  "SiteSignalAuditBot/0.1 (+https://sitesignal.local/audit-bot)";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export function shouldReadResponseBody(input: {
  contentType: string | undefined;
  statusCode: number;
  method: "GET" | "HEAD";
  skipNonHtmlBody: boolean;
}): boolean {
  if (input.method === "HEAD" || redirectStatuses.has(input.statusCode)) {
    return false;
  }
  if (!input.skipNonHtmlBody) return true;
  const contentType = input.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return (
    !contentType ||
    contentType === "text/html" ||
    contentType === "application/xhtml+xml" ||
    contentType === "text/plain"
  );
}

export type SecureHttpErrorCode =
  | "ABORTED"
  | "BODY_TOO_LARGE"
  | "INVALID_CONTENT_ENCODING"
  | "NETWORK_ERROR"
  | "REDIRECT_LIMIT"
  | "REDIRECT_LOOP"
  | "REDIRECT_WITHOUT_LOCATION"
  | "REMOTE_ADDRESS_MISMATCH"
  | "REQUEST_TIMEOUT";

export class SecureHttpError extends Error {
  readonly code: SecureHttpErrorCode;
  readonly retryable: boolean;
  readonly redirects: readonly SecureRedirectHop[];

  constructor(
    code: SecureHttpErrorCode,
    message: string,
    options: {
      retryable: boolean;
      cause?: unknown;
      redirects?: readonly SecureRedirectHop[];
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "SecureHttpError";
    this.code = code;
    this.retryable = options.retryable;
    this.redirects = options.redirects ?? [];
  }
}

export type SecureRedirectHop = {
  sourceUrl: string;
  statusCode: number;
  destinationUrl: string;
};

export type SecureHttpResponse = {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  setCookieHeaders: readonly string[];
  body: Buffer;
  durationMs: number;
  redirectCount: number;
  redirects: readonly SecureRedirectHop[];
};

export type SecureHttpOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maximumBodyBytes?: number;
  maximumRedirects?: number;
  userAgent?: string;
  method?: "GET" | "HEAD";
  skipNonHtmlBody?: boolean;
  onRedirect?: (destination: URL, source: URL) => void | Promise<void>;
};

type SingleResponse = Omit<
  SecureHttpResponse,
  "requestedUrl" | "redirectCount" | "redirects"
>;

function normalizeAddress(address: string): string {
  const lowered = address.toLowerCase();
  return lowered.startsWith("::ffff:") && isIP(lowered.slice(7)) === 4
    ? lowered.slice(7)
    : lowered;
}

function createPinnedLookup(address: DnsLookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  };
}

function headersToRecord(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();
    if (normalizedName === "set-cookie") continue;
    if (value !== undefined) result[normalizedName] = value.toString();
  }
  return result;
}

function responseStream(
  response: Readable,
  contentEncoding: string | undefined,
): Readable {
  const encoding = contentEncoding?.trim().toLowerCase();
  if (!encoding || encoding === "identity") return response;
  if (encoding === "gzip" || encoding === "x-gzip") {
    return response.pipe(createGunzip());
  }
  if (encoding === "deflate") return response.pipe(createInflate());
  if (encoding === "br") return response.pipe(createBrotliDecompress());
  throw new SecureHttpError(
    "INVALID_CONTENT_ENCODING",
    `Unsupported response content encoding: ${encoding}.`,
    { retryable: false },
  );
}

async function readBoundedBody(
  response: Readable,
  contentEncoding: string | undefined,
  maximumBodyBytes: number,
): Promise<Buffer> {
  const stream = responseStream(response, contentEncoding);
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maximumBodyBytes) {
      stream.destroy();
      throw new SecureHttpError(
        "BODY_TOO_LARGE",
        `Response body exceeded the ${maximumBodyBytes}-byte audit limit.`,
        { retryable: false },
      );
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

function requestAddress(
  target: ValidatedPublicUrl,
  address: DnsLookupAddress,
  options: Required<
    Pick<
      SecureHttpOptions,
      | "maximumBodyBytes"
      | "method"
      | "timeoutMs"
      | "userAgent"
      | "skipNonHtmlBody"
    >
  > & { signal?: AbortSignal },
): Promise<SingleResponse> {
  const startedAt = Date.now();
  const requestImplementation =
    target.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (options.signal?.aborted) {
        reject(
          new SecureHttpError("ABORTED", "The audit request was cancelled.", {
            retryable: false,
            cause: options.signal.reason,
          }),
        );
        return;
      }
      reject(error);
    };

    const request = requestImplementation(
      target.url,
      {
        method: options.method,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": options.userAgent,
        },
        lookup: createPinnedLookup(address),
        signal: options.signal,
        timeout: options.timeoutMs,
        ...(target.url.protocol === "https:"
          ? { servername: target.url.hostname }
          : {}),
      },
      (response) => {
        const remoteAddress = response.socket.remoteAddress;
        const expectedAddress = normalizeAddress(address.address);
        if (
          !remoteAddress ||
          !isPublicIpAddress(remoteAddress) ||
          normalizeAddress(remoteAddress) !== expectedAddress
        ) {
          response.destroy();
          finishReject(
            new SecureHttpError(
              "REMOTE_ADDRESS_MISMATCH",
              "The server connection did not use the DNS-validated address.",
              { retryable: false },
            ),
          );
          return;
        }

        const headers = headersToRecord(response.headers);
        const setCookieHeaders = response.headers["set-cookie"] ?? [];
        if (
          !shouldReadResponseBody({
            contentType: headers["content-type"],
            statusCode: response.statusCode ?? 0,
            method: options.method,
            skipNonHtmlBody: options.skipNonHtmlBody,
          })
        ) {
          settled = true;
          response.destroy();
          resolve({
            finalUrl: target.url.href,
            statusCode: response.statusCode ?? 0,
            headers,
            setCookieHeaders,
            body: Buffer.alloc(0),
            durationMs: Date.now() - startedAt,
          });
          return;
        }
        void readBoundedBody(
          response,
          headers["content-encoding"],
          options.maximumBodyBytes,
        ).then((body) => {
          if (settled) return;
          settled = true;
          resolve({
            finalUrl: target.url.href,
            statusCode: response.statusCode ?? 0,
            headers,
            setCookieHeaders,
            body,
            durationMs: Date.now() - startedAt,
          });
        }, finishReject);
      },
    );

    request.once("timeout", () => {
      request.destroy(
        new SecureHttpError(
          "REQUEST_TIMEOUT",
          `The audit request exceeded ${options.timeoutMs}ms.`,
          { retryable: true },
        ),
      );
    });
    request.once("error", (error) => {
      if (error instanceof SecureHttpError) {
        finishReject(error);
        return;
      }
      finishReject(
        new SecureHttpError("NETWORK_ERROR", "The website request failed.", {
          retryable: true,
          cause: error,
        }),
      );
    });
    request.end();
  });
}

async function requestValidatedUrl(
  target: ValidatedPublicUrl,
  options: Required<
    Pick<
      SecureHttpOptions,
      | "maximumBodyBytes"
      | "method"
      | "timeoutMs"
      | "userAgent"
      | "skipNonHtmlBody"
    >
  > & { signal?: AbortSignal },
): Promise<SingleResponse> {
  let lastError: unknown;
  for (const address of target.resolution.addresses) {
    try {
      return await requestAddress(target, address, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new SecureHttpError("NETWORK_ERROR", "The website request failed.", {
        retryable: true,
      });
}

/** Bounds the entire DNS, redirect, and response sequence, not just socket idle time. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(controller.signal.reason);
    if (controller.signal.aborted) abortListener();
    else
      controller.signal.addEventListener("abort", abortListener, {
        once: true,
      });
  });

  try {
    return await Promise.race([operation(controller.signal), aborted]);
  } catch (error) {
    if (timedOut) {
      throw new SecureHttpError(
        "REQUEST_TIMEOUT",
        `The audit request exceeded ${timeoutMs}ms.`,
        { retryable: true, cause: error },
      );
    }
    if (parentSignal?.aborted) {
      throw new SecureHttpError("ABORTED", "The audit request was cancelled.", {
        retryable: false,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
    if (abortListener)
      controller.signal.removeEventListener("abort", abortListener);
  }
}

/**
 * Fetches an HTTP(S) resource while pinning the connection to DNS-validated
 * public addresses. Redirect destinations are re-resolved and revalidated.
 */
export async function secureFetchUrl(
  value: string | URL,
  options: SecureHttpOptions = {},
): Promise<SecureHttpResponse> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  return withRequestDeadline(
    async (signal) => {
      signal.throwIfAborted();
      const startedAt = Date.now();
      const requestedUrl = value.toString();
      const requestOptions = {
        timeoutMs,
        maximumBodyBytes: options.maximumBodyBytes ?? 2 * 1024 * 1024,
        userAgent: options.userAgent ?? AUDIT_USER_AGENT,
        method: options.method ?? "GET",
        skipNonHtmlBody: options.skipNonHtmlBody ?? false,
        signal,
      };
      const maximumRedirects = options.maximumRedirects ?? 5;
      let target = await validatePublicHttpUrl(value);
      signal.throwIfAborted();
      const visitedUrls = new Set([target.url.href]);
      const redirects: SecureRedirectHop[] = [];

      for (let redirectCount = 0; ; redirectCount += 1) {
        let response: SingleResponse;
        try {
          response = await requestValidatedUrl(target, requestOptions);
        } catch (error) {
          if (
            error instanceof SecureHttpError &&
            redirects.length > 0 &&
            error.redirects.length === 0
          ) {
            throw new SecureHttpError(error.code, error.message, {
              retryable: error.retryable,
              cause: error,
              redirects,
            });
          }
          throw error;
        }
        if (!redirectStatuses.has(response.statusCode)) {
          return {
            ...response,
            requestedUrl,
            durationMs: Date.now() - startedAt,
            redirectCount,
            redirects,
          };
        }

        const location = response.headers.location;
        if (!location) {
          throw new SecureHttpError(
            "REDIRECT_WITHOUT_LOCATION",
            "The website returned a redirect without a destination.",
            { retryable: false, redirects },
          );
        }
        if (redirectCount >= maximumRedirects) {
          throw new SecureHttpError(
            "REDIRECT_LIMIT",
            `The website exceeded the ${maximumRedirects}-redirect limit.`,
            { retryable: false, redirects },
          );
        }

        const destination = await validateRedirectDestination(
          location,
          target.url,
        );
        signal.throwIfAborted();
        const redirectHop: SecureRedirectHop = {
          sourceUrl: target.url.href,
          statusCode: response.statusCode,
          destinationUrl: destination.url.href,
        };
        if (visitedUrls.has(destination.url.href)) {
          throw new SecureHttpError(
            "REDIRECT_LOOP",
            "The website returned a redirect loop.",
            { retryable: false, redirects: [...redirects, redirectHop] },
          );
        }
        redirects.push(redirectHop);
        await options.onRedirect?.(destination.url, target.url);
        signal.throwIfAborted();
        visitedUrls.add(destination.url.href);
        target = destination;
      }
    },
    timeoutMs,
    options.signal,
  );
}
