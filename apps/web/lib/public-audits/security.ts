import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

function publicAuditSecret(): string {
  const secret = [
    process.env.PUBLIC_AUDIT_HASH_SECRET,
    process.env.AUTH_SECRET,
  ].find((value) => value?.trim());
  if (
    !secret ||
    secret.length < 32 ||
    secret === "replace-with-a-long-random-secret"
  ) {
    throw new Error(
      "PUBLIC_AUDIT_HASH_SECRET or a secure AUTH_SECRET is required.",
    );
  }
  return secret;
}

function forwardedAddress(request: Request): string | null {
  const trustForwarded =
    process.env.PUBLIC_AUDIT_TRUST_PROXY === "true" ||
    process.env.VERCEL === "1" ||
    process.env.CF_PAGES === "1";
  if (!trustForwarded) return null;

  const candidate =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-real-ip");
  const value = candidate?.trim() ?? "";
  return isIP(value) ? value : null;
}

function hmac(value: string): string {
  return createHmac("sha256", publicAuditSecret()).update(value).digest("hex");
}

/** Hashes network/browser signals; raw client addresses are never stored. */
export function createPublicAuditClientKey(request: Request): string {
  const address = forwardedAddress(request);
  if (address) return hmac(`client-address\u0000${address}`);
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(
    0,
    300,
  );
  const language = (request.headers.get("accept-language") ?? "unknown").slice(
    0,
    100,
  );
  return hmac(`untrusted-client\u0000${userAgent}\u0000${language}`);
}

export function createPublicAuditTargetKey(normalizedUrl: string): string {
  return hmac(`target\u0000${normalizedUrl}`);
}

export function createPublicLeadEmailKey(email: string): string {
  return hmac(`lead-email\u0000${email.trim().toLowerCase()}`);
}

export function createPublicLeadAuditKey(publicAuditToken: string): string {
  return hmac(`lead-audit\u0000${publicAuditToken}`);
}

/** Blocks cross-site form abuse while permitting non-browser API clients. */
export function isAllowedPublicAuditOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch {
    return false;
  }
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
  ]) {
    if (!configured) continue;
    try {
      allowedOrigins.add(new URL(configured).origin);
    } catch {
      // Invalid deployment configuration does not broaden the allow-list.
    }
  }
  return allowedOrigins.has(origin);
}
