import type { Metadata } from "next";

import { AuditHistory } from "../../../components/audits/audit-history";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../lib/auth/permissions";
import { getWorkspaceAuditHistory } from "../../../lib/audits/history";
import { parseAuditHistoryFilters } from "../../../lib/audits/history-validation";

export const metadata: Metadata = { title: "Audit history | SiteSignal" };

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const filters = parseAuditHistoryFilters(await searchParams);
  const result = await getWorkspaceAuditHistory(account, filters);

  return (
    <AuditHistory
      result={result}
      filters={filters}
      canManage={canManageWorkspace(account)}
    />
  );
}
