import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicAuditHeader } from "../../../components/public-audits/public-audit-header";
import { PublicAuditResults } from "../../../components/public-audits/public-audit-results";
import { getFreePublicAudit } from "../../../lib/public-audits/service";
import { getCurrentAccount } from "../../../lib/auth/current-user";
import { getWorkspaceEntitlements } from "@website-audit/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free Audit Results | SiteSignal",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PublicAuditResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const audit = await getFreePublicAudit(token);
  if (!audit) notFound();
  const account = await getCurrentAccount();
  const plan = account
    ? await getWorkspaceEntitlements(account.workspace.id)
    : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div aria-hidden="true" className="page-glow" />
      <div className="relative">
        <PublicAuditHeader />
        <PublicAuditResults initialAudit={audit} currentPlan={plan?.plan} />
      </div>
    </div>
  );
}
