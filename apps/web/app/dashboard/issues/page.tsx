import type { Metadata } from "next";

import { IssueExplorer } from "../../../components/issues/issue-explorer";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../lib/auth/permissions";
import { getWorkspaceIssueExplorer } from "../../../lib/issues/service";
import { parseIssueFilters } from "../../../lib/issues/validation";

export const metadata: Metadata = { title: "Issues | SiteSignal" };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const filters = parseIssueFilters(await searchParams);
  const result = await getWorkspaceIssueExplorer(account, filters);

  return (
    <IssueExplorer
      result={result}
      filters={filters}
      basePath="/dashboard/issues"
      canManage={canManageWorkspace(account)}
    />
  );
}
