import "server-only";

import { getAuditComparisonForWorkspace } from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import type { AuditComparisonSelection } from "./comparison-validation";

export type AuditComparisonView = Awaited<
  ReturnType<typeof getWorkspaceAuditComparison>
>;

export async function getWorkspaceAuditComparison(
  account: CurrentAccount,
  selection: AuditComparisonSelection,
) {
  const result = await getAuditComparisonForWorkspace({
    workspaceId: account.workspace.id,
    ...(selection.website ? { websiteId: selection.website } : {}),
    ...(selection.auditA ? { auditAId: selection.auditA } : {}),
    ...(selection.auditB ? { auditBId: selection.auditB } : {}),
  });

  return {
    ...result,
    options: {
      ...result.options,
      audits: result.options.audits.map((audit) => ({
        ...audit,
        createdAt: audit.createdAt.toISOString(),
        completedAt: audit.completedAt.toISOString(),
      })),
    },
    comparison: result.comparison
      ? {
          ...result.comparison,
          auditA: {
            ...result.comparison.auditA,
            createdAt: result.comparison.auditA.createdAt.toISOString(),
            completedAt: result.comparison.auditA.completedAt.toISOString(),
          },
          auditB: {
            ...result.comparison.auditB,
            createdAt: result.comparison.auditB.createdAt.toISOString(),
            completedAt: result.comparison.auditB.completedAt.toISOString(),
          },
        }
      : null,
  };
}
