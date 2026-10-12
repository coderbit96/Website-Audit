import { RateLimitError } from "@website-audit/shared";

import { connectToDatabase } from "../connection.js";
import { RateLimitCounterModel } from "../models.js";

export { RateLimitError } from "@website-audit/shared";

export type RateLimitRule = {
  /** Internal endpoint/action identifier. Never return this to clients. */
  scope: string;
  /** One-way HMAC digest of an account, workspace, email, or client signal. */
  keyHash: string;
  windowMs: number;
  limit: number;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function assertRule(rule: RateLimitRule): void {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(rule.scope)) {
    throw new Error("Rate-limit scope is invalid.");
  }
  if (!/^[a-f0-9]{64,128}$/i.test(rule.keyHash)) {
    throw new Error("Rate-limit key must be a one-way digest.");
  }
  if (
    !Number.isSafeInteger(rule.windowMs) ||
    rule.windowMs < 1_000 ||
    rule.windowMs > 31 * 24 * 60 * 60_000
  ) {
    throw new Error("Rate-limit window is invalid.");
  }
  if (
    !Number.isSafeInteger(rule.limit) ||
    rule.limit < 1 ||
    rule.limit > 1_000_000
  ) {
    throw new Error("Rate-limit limit is invalid.");
  }
}

async function consumeRule(rule: RateLimitRule, now: Date): Promise<void> {
  assertRule(rule);
  const windowStartMs =
    Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + rule.windowMs + 60_000);

  try {
    const record = await RateLimitCounterModel.findOneAndUpdate(
      {
        scope: rule.scope,
        keyHash: rule.keyHash,
        windowStart,
        count: { $lt: rule.limit },
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    )
      .select({ _id: 1 })
      .lean()
      .exec();
    if (record) return;
  } catch (error) {
    // A concurrent upsert may lose the compound unique-index race. The next
    // request will observe the counter, so safely treat this one as limited.
    if (!isDuplicateKeyError(error)) throw error;
  }

  throw new RateLimitError(
    (windowStartMs + rule.windowMs - now.getTime()) / 1_000,
  );
}

/**
 * Atomically consumes every applicable window. Rules may intentionally be
 * layered (for example account and workspace) to resist account sharing.
 */
export async function consumeRateLimitRules(
  rules: readonly RateLimitRule[],
  now = new Date(),
): Promise<void> {
  if (rules.length === 0 || rules.length > 8) {
    throw new Error(
      "Rate-limit rules must contain between one and eight entries.",
    );
  }
  await connectToDatabase();
  for (const rule of rules) await consumeRule(rule, now);
}
