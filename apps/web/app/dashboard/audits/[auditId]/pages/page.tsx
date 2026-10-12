import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageExplorer } from "../../../../../components/pages/page-explorer";
import { requireCurrentAccount } from "../../../../../lib/auth/current-user";
import { getWorkspacePageExplorer } from "../../../../../lib/pages/service";
import { parsePageExplorerQuery } from "../../../../../lib/pages/validation";

export const metadata: Metadata = { title: "Audit pages | SiteSignal" };

export default async function AuditPagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const { auditId } = await params;
  const query = parsePageExplorerQuery(await searchParams);
  const result = await getWorkspacePageExplorer(account, auditId, query);
  if (!result) notFound();

  return <PageExplorer result={result} query={query} />;
}
