import "server-only";

import { validatePublicHttpUrl } from "@website-audit/audit-core";
import {
  consumePublicAuditRateLimits,
  enqueuePublicAudit,
  getPublicAuditByToken,
  type PublicAuditViewRecord,
} from "@website-audit/database";

import { normalizeWebsiteUrl, WebsiteUrlError } from "../websites/validation";
import type { CurrentAccount } from "../auth/current-user";
import {
  requirePublicAuditCapacity,
  rollbackPlanCapacity,
} from "../entitlements/service";
import {
  createPublicAuditClientKey,
  createPublicAuditTargetKey,
} from "./security";
import type { PublicAuditView } from "./types";
import type { PublicAuditRequestInput } from "./validation";

export class PublicAuditInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicAuditInputError";
  }
}

function serializePublicAudit(record: PublicAuditViewRecord): PublicAuditView {
  return {
    ...record,
    scores: record.scores.map((score) => ({
      category: score.category as PublicAuditView["scores"][number]["category"],
      score: score.score,
      evaluated: score.evaluated,
    })),
    topIssues: record.topIssues.map((issue) => ({
      ...issue,
      severity:
        issue.severity as PublicAuditView["topIssues"][number]["severity"],
    })),
    status: record.status as PublicAuditView["status"],
    currentStage: record.currentStage as PublicAuditView["currentStage"],
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function createFreePublicAudit(
  request: Request,
  input: PublicAuditRequestInput,
  account?: CurrentAccount | null,
): Promise<{ auditId: string; token: string; expiresAt: string }> {
  let normalized: ReturnType<typeof normalizeWebsiteUrl>;
  try {
    normalized = normalizeWebsiteUrl(input.url);
  } catch (error) {
    throw new PublicAuditInputError(
      error instanceof WebsiteUrlError
        ? error.message
        : "Enter a valid public website domain.",
    );
  }

  const clientKeyHash = createPublicAuditClientKey(request);
  const targetHash = createPublicAuditTargetKey(normalized.normalizedUrl);
  await consumePublicAuditRateLimits({ clientKeyHash, targetHash });

  try {
    await validatePublicHttpUrl(normalized.url);
  } catch {
    throw new PublicAuditInputError(
      "Enter a publicly reachable HTTP or HTTPS website.",
    );
  }

  const reservation = account
    ? await requirePublicAuditCapacity(account.workspace.id)
    : null;
  let result: Awaited<ReturnType<typeof enqueuePublicAudit>>;
  try {
    result = await enqueuePublicAudit({
      targetUrl: normalized.url,
      normalizedUrl: normalized.normalizedUrl,
      clientKeyHash,
      targetHash,
    });
  } catch (error) {
    if (reservation) await rollbackPlanCapacity(reservation);
    throw error;
  }
  return {
    auditId: result.auditId,
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
  };
}

export async function getFreePublicAudit(
  token: string,
): Promise<PublicAuditView | null> {
  const record = await getPublicAuditByToken(token);
  return record ? serializePublicAudit(record) : null;
}
