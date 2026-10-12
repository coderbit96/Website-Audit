import "server-only";

import {
  getAuditPageDetailForWorkspace,
  listAuditPagesForWorkspace,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import type { PageExplorerQuery } from "./validation";

function serializeEvidence(evidence: unknown): unknown {
  if (evidence === undefined) return null;
  return JSON.parse(JSON.stringify(evidence)) as unknown;
}

export async function getWorkspacePageExplorer(
  account: CurrentAccount,
  auditId: string,
  query: PageExplorerQuery,
) {
  const result = await listAuditPagesForWorkspace({
    workspaceId: account.workspace.id,
    auditId,
    page: query.page,
    pageSize: 25,
    ...(query.search ? { search: query.search } : {}),
  });
  if (!result) return null;
  return {
    ...result,
    audit: {
      ...result.audit,
      createdAt: result.audit.createdAt.toISOString(),
    },
  };
}

export type PageExplorerView = NonNullable<
  Awaited<ReturnType<typeof getWorkspacePageExplorer>>
>;

export async function getWorkspacePageDetail(
  account: CurrentAccount,
  auditId: string,
  pageId: string,
) {
  const result = await getAuditPageDetailForWorkspace({
    workspaceId: account.workspace.id,
    auditId,
    pageId,
  });
  if (!result) return null;
  return {
    ...result,
    audit: {
      ...result.audit,
      createdAt: result.audit.createdAt.toISOString(),
    },
    page: {
      ...result.page,
      crawledAt: result.page.crawledAt?.toISOString() ?? null,
    },
    findings: result.findings.map((finding) => ({
      ...finding,
      evidence: serializeEvidence(finding.evidence),
    })),
  };
}

export type PageDetailView = NonNullable<
  Awaited<ReturnType<typeof getWorkspacePageDetail>>
>;
