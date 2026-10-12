import Link from "next/link";
import { redirect } from "next/navigation";

import { LazyAuditScoreHistoryChart } from "../../components/audits/lazy-audit-score-history-chart";
import { DashboardIcon } from "../../components/dashboard/dashboard-icon";
import { getWorkspaceAuditHistory } from "../../lib/audits/history";
import { requireCurrentAccount } from "../../lib/auth/current-user";
import { isSuperAdmin } from "../../lib/auth/permissions";
import { getDashboardAnalytics } from "../../lib/dashboard/analytics";

function scoreLabel(score: number | null): string {
  return score === null ? "N/A" : `${Math.round(score)}`;
}

export default async function DashboardPage() {
  const account = await requireCurrentAccount();
  if (!isSuperAdmin(account)) redirect("/profile");
  const [analytics, recentAudits] = await Promise.all([
    getDashboardAnalytics(account),
    getWorkspaceAuditHistory(account, { page: 1 }),
  ]);
  const firstName = account.name.split(/\s+/)[0] ?? account.name;
  const hasCompletedHistory = recentAudits.trend.points.length >= 2;
  const hasAudits = analytics.auditCount > 0;

  return (
    <div className="overview-page">
      <section className="overview-heading">
        <div>
          <p className="page-eyebrow">Overview</p>
          <h1>Welcome back, {firstName}</h1>
          <p>
            Monitor current site health, track completed audits, and focus on
            the issues that need attention first.
          </p>
        </div>
        <Link className="app-primary-link" href="/dashboard/websites">
          <DashboardIcon name="websites" />
          Manage websites
        </Link>
      </section>

      <section className="dashboard-stat-grid" aria-label="Workspace analytics">
        <article>
          <span>Total websites</span>
          <strong>{analytics.websiteCount}</strong>
          <p>All websites in this workspace</p>
        </article>
        <article>
          <span>Total audits</span>
          <strong>{analytics.auditCount}</strong>
          <p>Queued, active, and historical audits</p>
        </article>
        <article>
          <span>Average health</span>
          <strong>{scoreLabel(analytics.averageHealthScore)}</strong>
          <p>
            {analytics.averageHealthScore === null
              ? "No completed audit scores yet"
              : "Across completed audits"}
          </p>
        </article>
        <article className="dashboard-stat-critical">
          <span>Critical issues</span>
          <strong>{analytics.issueCounts.critical}</strong>
          <p>Open or reopened in latest audits</p>
        </article>
        <article className="dashboard-stat-warning">
          <span>Warnings</span>
          <strong>{analytics.issueCounts.warnings}</strong>
          <p>Open or reopened in latest audits</p>
        </article>
        <article className="dashboard-stat-resolved">
          <span>Resolved issues</span>
          <strong>{analytics.issueCounts.resolved}</strong>
          <p>Marked fixed in latest audits</p>
        </article>
      </section>

      {!hasAudits ? (
        <section className="overview-empty-state">
          <div className="empty-state-icon">
            <DashboardIcon name="audits" />
          </div>
          <div>
            <p className="page-eyebrow">Audit activity</p>
            <h2>No audit activity yet</h2>
            <p>
              This area will show real audit activity as soon as the workspace
              runs its first audit. No sample records are displayed.
            </p>
            <Link
              className="overview-empty-action"
              href={
                analytics.websiteCount > 0
                  ? "/dashboard/audits/new"
                  : "/dashboard/websites"
              }
            >
              {analytics.websiteCount > 0 ? "Create an audit" : "Add a website"}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="overview-trends">
            <header>
              <div>
                <p className="page-eyebrow">Score trends</p>
                <h2>
                  {recentAudits.trend.website
                    ? recentAudits.trend.website.name
                    : "Website score history"}
                </h2>
              </div>
              <Link href="/dashboard/audits">View audit history</Link>
            </header>
            {hasCompletedHistory ? (
              <LazyAuditScoreHistoryChart points={recentAudits.trend.points} />
            ) : (
              <div className="overview-trend-empty">
                <DashboardIcon name="audits" />
                <div>
                  <h3>More score history is needed</h3>
                  <p>
                    Run at least two completed audits for the same website to
                    show overall, SEO, performance, accessibility, and security
                    trends.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="overview-recent-audits">
            <header>
              <div>
                <p className="page-eyebrow">Audit activity</p>
                <h2>Recent audits</h2>
              </div>
              <Link href="/dashboard/audits">View all</Link>
            </header>
            <ul>
              {recentAudits.items.slice(0, 5).map((audit) => (
                <li key={audit.id}>
                  <div>
                    <strong>{audit.website.name}</strong>
                    <span>
                      {audit.status.toLowerCase().replaceAll("_", " ")} |{" "}
                      {audit.pagesCrawled} pages crawled
                    </span>
                  </div>
                  <div>
                    <b>{scoreLabel(audit.scores.OVERALL)}</b>
                    <Link href={`/dashboard/audits/${audit.id}`}>
                      Open audit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
