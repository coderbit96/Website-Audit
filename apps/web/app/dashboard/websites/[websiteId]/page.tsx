import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StartAuditButton } from "../../../../components/audits/start-audit-button";
import { getWorkspaceAuditHistory } from "../../../../lib/audits/history";
import { requireCurrentAccount } from "../../../../lib/auth/current-user";
import { canManageWorkspace } from "../../../../lib/auth/permissions";
import { getWorkspaceWebsite } from "../../../../lib/websites/service";

export const metadata: Metadata = {
  title: "Website details | SiteSignal",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function WebsiteDetailsPage({
  params,
}: {
  params: Promise<{ websiteId: string }>;
}) {
  const account = await requireCurrentAccount();
  const { websiteId } = await params;
  const website = await getWorkspaceWebsite(account, websiteId);

  if (!website) {
    notFound();
  }
  const auditHistory = await getWorkspaceAuditHistory(account, {
    page: 1,
    website: website.id,
  });
  const latestAudit = auditHistory.items[0] ?? null;

  return (
    <div className="website-detail-page">
      <Link className="website-back-link" href="/dashboard/websites">
        ← Back to websites
      </Link>
      <section className="website-detail-heading">
        <div>
          <div className="website-detail-title-line">
            <h1>{website.name}</h1>
            <span data-active={website.isActive}>
              {website.isActive ? "Active" : "Archived"}
            </span>
          </div>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            title={website.url}
            aria-label={`Open ${website.url} in a new tab`}
          >
            {website.url} <span aria-hidden="true">↗</span>
          </a>
        </div>
        <StartAuditButton
          websiteId={website.id}
          disabled={!website.isActive || !canManageWorkspace(account)}
        />
      </section>

      <section className="website-detail-grid" aria-label="Website details">
        <article>
          <span>Status</span>
          <strong>{website.isActive ? "Active" : "Archived"}</strong>
        </article>
        <article>
          <span>Added</span>
          <strong>{formatDate(website.createdAt)}</strong>
        </article>
        <article>
          <span>Last audit</span>
          <strong>
            {website.lastAuditedAt
              ? formatDate(website.lastAuditedAt)
              : "Not audited yet"}
          </strong>
        </article>
      </section>

      {latestAudit ? (
        <section className="website-audit-latest">
          <div>
            <p className="page-eyebrow">Latest audit</p>
            <h2>{latestAudit.status.toLowerCase().replaceAll("_", " ")}</h2>
            <p>
              {latestAudit.pagesCrawled} pages crawled · Overall score{" "}
              {latestAudit.scores.OVERALL === null
                ? "N/A"
                : Math.round(latestAudit.scores.OVERALL)}
            </p>
          </div>
          <Link href={`/dashboard/audits/${latestAudit.id}`}>
            Open latest audit
          </Link>
        </section>
      ) : (
        <section className="website-audit-empty">
          <div>◎</div>
          <h2>No audit activity yet</h2>
          <p>
            Create an audit to crawl this website and populate real health
            scores, findings, page records, and reports.
          </p>
          {website.isActive && canManageWorkspace(account) ? (
            <Link href={`/dashboard/audits/new?websiteId=${website.id}`}>
              Create an audit
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
