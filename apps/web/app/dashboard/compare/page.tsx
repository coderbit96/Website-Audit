import type { Metadata } from "next";

import { AuditComparison } from "../../../components/audits/audit-comparison";
import { getWorkspaceAuditComparison } from "../../../lib/audits/comparison";
import { parseAuditComparisonSelection } from "../../../lib/audits/comparison-validation";
import { requireCurrentAccount } from "../../../lib/auth/current-user";

export const metadata: Metadata = { title: "Compare audits | SiteSignal" };

export default async function CompareAuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const selection = parseAuditComparisonSelection(await searchParams);
  const result = await getWorkspaceAuditComparison(account, selection);

  return <AuditComparison result={result} selection={selection} />;
}
