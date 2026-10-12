import "server-only";

import {
  AuditType,
  cancelAudit,
  enqueueAudit,
  getAuditJobStatus,
  type AuditJobStatusRecord,
} from "@website-audit/database";
import { getAuditQueuePriority, getMaxCrawlPages } from "@website-audit/shared";

import type { CurrentAccount } from "../auth/current-user";
import {
  rollbackPlanCapacities,
  requireAuditCapacity,
} from "../entitlements/service";
import type { AuditJobView } from "./types";
import type { CreateAuditInput } from "./validation";

const auditTypeByPreset = {
  QUICK: AuditType.QUICK,
  STANDARD: AuditType.STANDARD,
  FULL: AuditType.FULL,
} as const;

function serializeAudit(record: AuditJobStatusRecord): AuditJobView {
  return {
    auditId: record.auditId,
    websiteId: record.websiteId,
    status: record.status,
    progress: record.progress,
    currentStage: record.currentStage,
    pagesDiscovered: record.pagesDiscovered,
    pagesCrawled: record.pagesCrawled,
    message: record.message,
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    failureReason: record.failureReason,
    failureCode: record.failureCode,
    failureStage: record.failureStage,
    failureStep: record.failureStep,
    runAt: record.runAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function enqueueWorkspaceAudit(
  account: CurrentAccount,
  input: CreateAuditInput,
): Promise<{ auditId: string; status: "QUEUED"; progress: number }> {
  const capacity = await requireAuditCapacity({
    workspaceId: account.workspace.id,
    requestedPages: input.settings.maximumPages,
  });
  try {
    return await enqueueAudit({
      workspaceId: account.workspace.id,
      websiteId: input.websiteId,
      requestedById: account.id,
      type: auditTypeByPreset[input.preset],
      configuration: {
        preset: input.preset,
        ...input.settings,
        entitlementMaximumPages: getMaxCrawlPages(
          capacity.context.entitlements,
        ),
      },
      priority: getAuditQueuePriority(capacity.context.entitlements),
      usagePageReservation: input.settings.maximumPages,
      usagePeriodStart: capacity.context.usage.periodStart,
      usagePeriodEnd: capacity.context.usage.periodEnd,
    });
  } catch (error) {
    await rollbackPlanCapacities(capacity.reservations);
    throw error;
  }
}

export async function getWorkspaceAuditStatus(
  account: CurrentAccount,
  auditId: string,
): Promise<AuditJobView | null> {
  const record = await getAuditJobStatus({
    auditId,
    workspaceId: account.workspace.id,
  });
  return record ? serializeAudit(record) : null;
}

export function cancelWorkspaceAudit(account: CurrentAccount, auditId: string) {
  return cancelAudit({ auditId, workspaceId: account.workspace.id });
}
