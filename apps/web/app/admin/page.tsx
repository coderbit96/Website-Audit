import type { Metadata } from "next";
import Link from "next/link";

import { OfflineCreditForm } from "../../components/admin/offline-credit-form";
import { requireCurrentAccount } from "../../lib/auth/current-user";
import {
  getSuperAdminCreditRecipients,
  getSuperAdminOverview,
} from "../../lib/admin/service";

export const metadata: Metadata = {
  title: "System Administration | SiteSignal",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export default async function AdminOverviewPage() {
  const account = await requireCurrentAccount();
  const [overview, recipients] = await Promise.all([
    getSuperAdminOverview(account),
    getSuperAdminCreditRecipients(account),
  ]);
  const cards = [
    ["Total users", overview.totalUsers, "/admin/users"],
    ["Customer workspaces", overview.customerWorkspaces, "/admin/workspaces"],
    ["Audits today (IST)", overview.auditsToday, "/admin/audits"],
    ["Pages crawled today (IST)", overview.pagesCrawledToday, "/admin/usage"],
    ["Failed audits", overview.failedAudits, "/admin/failed-audits"],
    ["Queue size", overview.queueSize, "/admin/queue"],
  ] as const;

  return (
    <div className="admin-overview">
      <header className="admin-overview-heading">
        <div>
          <p className="page-eyebrow">Super Admin</p>
          <h1>System overview</h1>
          <p>Live operational facts across the SiteSignal application.</p>
        </div>
        <span>Restricted access</span>
      </header>
      <section className="admin-stat-grid" aria-label="System statistics">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
            <small>View details →</small>
          </Link>
        ))}
        <Link href="/admin/system-health" className="admin-worker-card">
          <span>Worker health</span>
          <strong>{overview.workerHealth}</strong>
          <small>{overview.workerHealthMessage}</small>
        </Link>
      </section>
      <section className="admin-overview-grid">
        <OfflineCreditForm recipients={recipients} />
        <section className="admin-recent-leads">
          <header>
            <div>
              <p className="page-eyebrow">Lead generation</p>
              <h2>Recent leads</h2>
            </div>
            <Link href="/admin/leads">View all</Link>
          </header>
          {overview.recentLeads.length === 0 ? (
            <p>No public-audit leads have been captured.</p>
          ) : (
            <ul>
              {overview.recentLeads.map((lead) => (
                <li key={lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span title={lead.websiteUrl}>{lead.websiteUrl}</span>
                  </div>
                  <time dateTime={lead.createdAt.toISOString()}>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(lead.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </div>
  );
}
