import "server-only";

import { listAuditHistoryForWorkspace } from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import type { AuditHistoryFilterInput } from "./history-validation";

export type AuditHistoryView = Awaited<
  ReturnType<typeof getWorkspaceAuditHistory>
>;

function startOfUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfNextUtcDay(value: string): Date {
  const date = startOfUtcDay(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function getWorkspaceAuditHistory(
  account: CurrentAccount,
  filters: AuditHistoryFilterInput,
) {
  const result = await listAuditHistoryForWorkspace({
    workspaceId: account.workspace.id,
    filters: {
      ...(filters.website ? { websiteId: filters.website } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.from ? { createdFrom: startOfUtcDay(filters.from) } : {}),
      ...(filters.to ? { createdBefore: startOfNextUtcDay(filters.to) } : {}),
      page: filters.page,
      pageSize: 20,
    },
  });

  return {
    ...result,
    items: result.items.map((audit) => ({
      ...audit,
      createdAt: audit.createdAt.toISOString(),
      startedAt: audit.startedAt?.toISOString() ?? null,
      completedAt: audit.completedAt?.toISOString() ?? null,
    })),
    trend: {
      ...result.trend,
      points: result.trend.points.map((point) => ({
        ...point,
        completedAt: point.completedAt.toISOString(),
      })),
    },
  };
}
