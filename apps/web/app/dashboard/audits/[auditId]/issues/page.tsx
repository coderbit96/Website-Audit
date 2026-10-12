import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IssueExplorer } from "../../../../../components/issues/issue-explorer";
import { getWorkspaceAuditStatus } from "../../../../../lib/audits/service";
import { requireCurrentAccount } from "../../../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../../../lib/auth/permissions";
import { getWorkspaceIssueExplorer } from "../../../../../lib/issues/service";
import { parseIssueFilters } from "../../../../../lib/issues/validation";

export const metadata: Metadata = { title: "Audit issues | SiteSignal" };

export default async function AuditIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const { auditId } = await params;
  const audit = await getWorkspaceAuditStatus(account, auditId);
  if (!audit) notFound();

  const parsed = parseIssueFilters(await searchParams);
  const filters = { ...parsed, audit: auditId, website: undefined };
  const result = await getWorkspaceIssueExplorer(account, filters);

  return (
    <IssueExplorer
      result={result}
      filters={filters}
      basePath={`/dashboard/audits/${auditId}/issues`}
      lockedAuditId={auditId}
      canManage={canManageWorkspace(account)}
    />
  );
}
