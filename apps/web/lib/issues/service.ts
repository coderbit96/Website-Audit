import "server-only";

import {
  listIssuesForWorkspace,
  updateIssueWorkflowStatus,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import type { IssueFilterInput, IssueWorkflowAction } from "./validation";
import { workflowStatusByAction } from "./validation";

export type IssueExplorerView = Awaited<
  ReturnType<typeof getWorkspaceIssueExplorer>
>;

function serializeEvidence(evidence: unknown): unknown {
  if (evidence === undefined) return null;
  return JSON.parse(JSON.stringify(evidence)) as unknown;
}

export async function getWorkspaceIssueExplorer(
  account: CurrentAccount,
  filters: IssueFilterInput,
) {
  const result = await listIssuesForWorkspace({
    workspaceId: account.workspace.id,
    filters: {
      ...(filters.website ? { websiteId: filters.website } : {}),
      ...(filters.audit ? { auditId: filters.audit } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.affectedPage ? { affectedPage: filters.affectedPage } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      sort: filters.sort,
      page: filters.page,
      pageSize: 25,
    },
  });

  return {
    ...result,
    items: result.items.map((issue) => ({
      ...issue,
      evidence: serializeEvidence(issue.evidence),
      auditCreatedAt: issue.auditCreatedAt.toISOString(),
      detectedAt: issue.detectedAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      resolvedAt: issue.resolvedAt?.toISOString() ?? null,
    })),
    options: {
      ...result.options,
      audits: result.options.audits.map((audit) => ({
        ...audit,
        createdAt: audit.createdAt.toISOString(),
      })),
    },
  };
}

export function changeWorkspaceIssueStatus(
  account: CurrentAccount,
  findingId: string,
  action: IssueWorkflowAction,
) {
  return updateIssueWorkflowStatus({
    workspaceId: account.workspace.id,
    userId: account.id,
    findingId,
    status: workflowStatusByAction[action],
  });
}
