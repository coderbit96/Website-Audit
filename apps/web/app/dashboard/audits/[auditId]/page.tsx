import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuditProgress } from "../../../../components/audits/audit-progress";
import { AuditReport } from "../../../../components/audits/audit-report";
import { requireCurrentAccount } from "../../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../../lib/auth/permissions";
import {
  getWorkspaceAuditReport,
  parseAuditReportTab,
} from "../../../../lib/audits/report";
import { getWorkspaceAuditStatus } from "../../../../lib/audits/service";
import { getWorkspaceWebsite } from "../../../../lib/websites/service";

export const metadata: Metadata = { title: "Audit report | SiteSignal" };

export default async function AuditProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const account = await requireCurrentAccount();
  const { auditId } = await params;
  const audit = await getWorkspaceAuditStatus(account, auditId);
  if (!audit) notFound();

  if (audit.status === "COMPLETED") {
    const activeTab = parseAuditReportTab((await searchParams).tab);
    const report = await getWorkspaceAuditReport(account, auditId, activeTab);
    if (!report) notFound();
    return <AuditReport report={report} activeTab={activeTab} />;
  }

  const website = await getWorkspaceWebsite(account, audit.websiteId);
  if (!website) notFound();

  return (
    <AuditProgress
      initialAudit={audit}
      websiteName={website.name}
      websiteUrl={website.url}
      canManage={canManageWorkspace(account)}
    />
  );
}
