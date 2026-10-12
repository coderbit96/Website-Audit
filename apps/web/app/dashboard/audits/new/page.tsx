import type { Metadata } from "next";
import Link from "next/link";
import { getMaxCrawlPages, UsageMetric } from "@website-audit/shared";

import { NewAuditForm } from "../../../../components/audits/new-audit-form";
import { requireCurrentAccount } from "../../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../../lib/auth/permissions";
import {
  getEffectiveUsageLimit,
  getWorkspacePlanContext,
} from "../../../../lib/entitlements/service";
import { listWorkspaceWebsites } from "../../../../lib/websites/service";

export const metadata: Metadata = { title: "New audit | SiteSignal" };

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ websiteId?: string | string[] }>;
}) {
  const account = await requireCurrentAccount();
  const [websites, plan] = await Promise.all([
    listWorkspaceWebsites(account, "active"),
    getWorkspacePlanContext(account.workspace.id),
  ]);
  const requestedWebsiteId = (await searchParams).websiteId;
  const requestedId =
    typeof requestedWebsiteId === "string" ? requestedWebsiteId : "";
  const initialWebsiteId =
    websites.find((website) => website.id === requestedId)?.id ??
    websites[0]?.id ??
    "";
  const monthlyAuditLimit = getEffectiveUsageLimit(
    plan,
    UsageMetric.AUDITS,
    plan.entitlements.limits.monthlyAudits,
  );

  return (
    <div className="new-audit-page">
      <Link className="website-back-link" href="/dashboard/audits">
        ← Back to audits
      </Link>
      <section className="new-audit-heading">
        <p className="page-eyebrow">Audit setup</p>
        <h1>Create a new audit</h1>
        <p>
          Choose safe coverage limits and analysis modules. Settings are
          validated again on the server before the audit is queued.
        </p>
      </section>
      <NewAuditForm
        websites={websites}
        initialWebsiteId={initialWebsiteId}
        canManage={canManageWorkspace(account)}
        plan={plan.plan}
        maximumPages={getMaxCrawlPages(plan.entitlements)}
        canRunAudit={plan.usage.monthlyAudits < monthlyAuditLimit}
        monthlyAuditsUsed={plan.usage.monthlyAudits}
        monthlyAuditLimit={monthlyAuditLimit}
      />
    </div>
  );
}
