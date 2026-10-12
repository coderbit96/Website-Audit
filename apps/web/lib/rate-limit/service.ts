import "server-only";

import { consumeRateLimitRules, RateLimitError } from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import { webLogger } from "../logging/logger";
import {
  createRateLimitAccountKey,
  createRateLimitClientKey,
  createRateLimitClientKeyFromHeaders,
  createRateLimitEmailKey,
  createRateLimitGlobalKey,
  createRateLimitWorkspaceKey,
  type RateLimitHeaderSource,
} from "./identity";
import {
  resolveRateLimitRules,
  type RateLimitAction,
  type RateLimitSubjects,
} from "./policies";

export function anonymousRateLimitSubjects(
  request: Request,
  email?: string,
): RateLimitSubjects {
  return {
    globalKey: createRateLimitGlobalKey(),
    clientKey: createRateLimitClientKey(request),
    ...(email ? { emailKey: createRateLimitEmailKey(email) } : {}),
  };
}

export function anonymousRateLimitSubjectsFromHeaders(
  headers: RateLimitHeaderSource,
  email?: string,
): RateLimitSubjects {
  return {
    globalKey: createRateLimitGlobalKey(),
    clientKey: createRateLimitClientKeyFromHeaders(headers),
    ...(email ? { emailKey: createRateLimitEmailKey(email) } : {}),
  };
}

export function authenticatedRateLimitSubjects(
  request: Request,
  account: CurrentAccount,
): RateLimitSubjects {
  return {
    clientKey: createRateLimitClientKey(request),
    accountKey: createRateLimitAccountKey(account.id),
    workspaceKey: createRateLimitWorkspaceKey(account.workspace.id),
  };
}

export async function enforceRateLimit(
  action: RateLimitAction,
  subjects: RateLimitSubjects,
): Promise<void> {
  try {
    await consumeRateLimitRules(resolveRateLimitRules(action, subjects));
  } catch (error) {
    if (error instanceof RateLimitError) {
      webLogger("warn", "security.rate_limit_rejected", {
        action,
        subjectTypes: Object.keys(subjects).sort(),
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    throw error;
  }
}
