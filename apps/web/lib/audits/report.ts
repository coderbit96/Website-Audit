import "server-only";

import { createPriorityActionPlan } from "@website-audit/audit-core";
import { getAuditReportForWorkspace } from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import {
  auditCategoryByReportTab,
  type AuditReportTab,
} from "./report-navigation";

export {
  auditReportTabs,
  parseAuditReportTab,
  type AuditReportTab,
} from "./report-navigation";

export type AuditReportView = NonNullable<
  Awaited<ReturnType<typeof getWorkspaceAuditReport>>
>;

export async function getWorkspaceAuditReport(
  account: CurrentAccount,
  auditId: string,
  tab: AuditReportTab,
) {
  const findingCategory = auditCategoryByReportTab[tab];
  const includeFindings =
    tab === "overview" || tab === "issues" || findingCategory !== undefined;
  const report = await getAuditReportForWorkspace({
    workspaceId: account.workspace.id,
    auditId,
    includeFindings,
    includePages: tab === "pages",
    includePriorityActions: tab === "overview",
    ...(findingCategory ? { findingCategory } : {}),
    findingLimit: tab === "overview" ? 6 : 100,
    pageLimit: 100,
  });
  if (!report) return null;

  const actionPlan = createPriorityActionPlan(report.priorityFindings);
  const startedAt = report.audit.startedAt?.toISOString() ?? null;
  const completedAt = report.audit.completedAt?.toISOString() ?? null;
  return {
    audit: {
      ...report.audit,
      createdAt: report.audit.createdAt.toISOString(),
      startedAt,
      completedAt,
      durationMs:
        startedAt && completedAt
          ? Math.max(
              0,
              new Date(completedAt).getTime() - new Date(startedAt).getTime(),
            )
          : null,
    },
    website: report.website,
    scores: report.scores,
    issueCounts: report.issueCounts,
    findings: report.findings,
    findingTotal: report.findingTotal,
    actionPlan,
    actionPlanSourceTruncated: report.priorityFindingsTruncated,
    pages: report.pages,
    pageTotal: report.pageTotal,
  };
}
