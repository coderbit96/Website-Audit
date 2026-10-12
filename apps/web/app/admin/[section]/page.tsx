import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AdminSection } from "@website-audit/database";

import { AuditRuleTable } from "../../../components/admin/audit-rule-table";
import { AdminTable } from "../../../components/admin/admin-table";
import { LeadList } from "../../../components/leads/lead-list";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import { parseAdminPage } from "../../../lib/admin/validation";
import {
  getSuperAdminAuditRules,
  getSuperAdminTable,
} from "../../../lib/admin/service";
import { adminNavigation } from "../../../components/admin/admin-links";
import { getSuperAdminLeadList } from "../../../lib/leads/service";
import { parseLeadListFilters } from "../../../lib/leads/validation";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sectionFrom(value: string) {
  return adminNavigation.find((item) => item.href === `/admin/${value}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = sectionFrom((await params).section);
  return { title: `${item?.label ?? "Admin"} | SiteSignal` };
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: Props) {
  const section = (await params).section;
  const item = sectionFrom(section);
  if (!item || section === "overview") notFound();
  const account = await requireCurrentAccount();
  if (section === "audit-rules") {
    return <AuditRuleTable rules={getSuperAdminAuditRules(account)} />;
  }
  const query = await searchParams;
  if (section === "leads") {
    const filters = parseLeadListFilters(query);
    const result = await getSuperAdminLeadList(account, filters);
    return (
      <LeadList result={result} filters={filters} basePath="/admin/leads" />
    );
  }
  const data = await getSuperAdminTable(
    account,
    section as AdminSection,
    parseAdminPage(query.page),
  );
  return <AdminTable data={data} basePath={`/admin/${section}`} />;
}
