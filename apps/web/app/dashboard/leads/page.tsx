import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadList } from "../../../components/leads/lead-list";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import { isSuperAdmin } from "../../../lib/auth/permissions";
import { getSuperAdminLeadList } from "../../../lib/leads/service";
import { parseLeadListFilters } from "../../../lib/leads/validation";

export const metadata: Metadata = { title: "Lead Inbox | SiteSignal" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  if (!isSuperAdmin(account)) notFound();

  const filters = parseLeadListFilters(await searchParams);
  const result = await getSuperAdminLeadList(account, filters);
  return <LeadList result={result} filters={filters} />;
}
