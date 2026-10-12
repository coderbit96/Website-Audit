import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type RateLimitHeaderSource =
  Headers | Record<string, string | string[] | undefined>;

function rateLimitSecret(): string {
  const secret = [
    process.env.RATE_LIMIT_HASH_SECRET,
    process.env.PUBLIC_AUDIT_HASH_SECRET,
    process.env.AUTH_SECRET,
  ].find((value) => value?.trim());
  if (
    !secret ||
    secret.length < 32 ||
    secret === "replace-with-a-long-random-secret"
  ) {
    throw new Error(
      "RATE_LIMIT_HASH_SECRET, PUBLIC_AUDIT_HASH_SECRET, or a secure AUTH_SECRET is required.",
    );
  }
  return secret;
}

function readHeader(
  source: RateLimitHeaderSource,
  name: string,
): string | null {
  if (source instanceof Headers) return source.get(name);
  const value = source[name] ?? source[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function trustedForwardedAddress(
  headers: RateLimitHeaderSource,
): string | null {
  const trustForwarded =
    process.env.RATE_LIMIT_TRUST_PROXY === "true" ||
    process.env.PUBLIC_AUDIT_TRUST_PROXY === "true" ||
    process.env.VERCEL === "1" ||
    process.env.CF_PAGES === "1";
  if (!trustForwarded) return null;

  const candidate =
    readHeader(headers, "x-vercel-forwarded-for") ??
    readHeader(headers, "cf-connecting-ip") ??
    readHeader(headers, "x-forwarded-for")?.split(",")[0] ??
    readHeader(headers, "x-real-ip");
  const value = candidate?.trim() ?? "";
  return isIP(value) ? value : null;
}

function hmac(namespace: string, value: string): string {
  return createHmac("sha256", rateLimitSecret())
    .update(`${namespace}\u0000${value}`)
    .digest("hex");
}

/**
 * Creates a privacy-preserving browser/network key. It supplements—not
 * replaces—account and workspace keys for authenticated endpoints.
 */
export function createRateLimitClientKey(request: Request): string {
  return createRateLimitClientKeyFromHeaders(request.headers);
}

export function createRateLimitClientKeyFromHeaders(
  headers: RateLimitHeaderSource,
): string {
  const address = trustedForwardedAddress(headers);
  if (address) return hmac("client-address", address);
  const userAgent = (readHeader(headers, "user-agent") ?? "unknown").slice(
    0,
    300,
  );
  const language = (readHeader(headers, "accept-language") ?? "unknown").slice(
    0,
    100,
  );
  return hmac("untrusted-client", `${userAgent}\u0000${language}`);
}

export function createRateLimitGlobalKey(): string {
  return hmac("global", "all-clients");
}

export function createRateLimitEmailKey(email: string): string {
  return hmac("email", email.trim().toLowerCase());
}

export function createRateLimitAccountKey(accountId: string): string {
  return hmac("account", accountId);
}

export function createRateLimitWorkspaceKey(workspaceId: string): string {
  return hmac("workspace", workspaceId);
}
