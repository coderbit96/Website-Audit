import Link from "next/link";

import type { AuditReportTab, AuditReportView } from "../../lib/audits/report";
import { PdfReportButton } from "./pdf-report-button";

const tabLabels: Readonly<Record<AuditReportTab, string>> = {
  overview: "Overview",
  seo: "SEO",
  technical: "Technical",
  performance: "Performance",
  accessibility: "Accessibility",
  security: "Security",
  mobile: "Mobile",
  pages: "Pages",
  issues: "Issues",
};

const scoreCategories = [
  ["SEO", "SEO"],
  ["TECHNICAL", "Technical"],
  ["PERFORMANCE", "Performance"],
  ["ACCESSIBILITY", "Accessibility"],
  ["SECURITY", "Security"],
  ["MOBILE", "Mobile"],
] as const;

const tabCategory: Partial<Record<AuditReportTab, string>> = {
  seo: "SEO",
  technical: "TECHNICAL",
  performance: "PERFORMANCE",
  accessibility: "ACCESSIBILITY",
  security: "SECURITY",
  mobile: "MOBILE",
};

type Score = AuditReportView["scores"][number];
type Finding = AuditReportView["findings"][number];
type ActionPlan = AuditReportView["actionPlan"];

const typedTabCategory = tabCategory as Partial<
  Record<AuditReportTab, Score["category"]>
>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "N/A";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m ${seconds}s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function scoreTone(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "attention";
  return "critical";
}

function ScoreGauge({
  score,
  label,
  compact = false,
}: {
  score: Score | undefined;
  label: string;
  compact?: boolean;
}) {
  const available = score?.evaluated === true;
  const value = available ? score.score : 0;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <div
      className="report-score-gauge"
      data-compact={compact || undefined}
      data-tone={available ? scoreTone(value) : "unavailable"}
      role="img"
      aria-label={
        available
          ? `${label} score: ${Math.round(value)} out of 100`
          : `${label} score unavailable`
      }
    >
      <svg aria-hidden="true" viewBox="0 0 104 104">
        <circle className="score-gauge-track" cx="52" cy="52" r={radius} />
        {available ? (
          <circle
            className="score-gauge-value"
            cx="52"
            cy="52"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        ) : null}
      </svg>
      <div className="score-gauge-copy">
        <strong>{available ? Math.round(value) : "N/A"}</strong>
        {available ? <small>/100</small> : null}
      </div>
      <span>{label}</span>
    </div>
  );
}

function FindingsList({
  findings,
  total,
  emptyMessage,
}: {
  findings: readonly Finding[];
  total: number;
  emptyMessage: string;
}) {
  if (findings.length === 0) {
    return (
      <div className="report-empty-state">
        <span aria-hidden="true">✓</span>
        <h3>No findings to show</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="report-finding-list">
      {findings.map((finding) => (
        <article className="report-finding" key={finding.id}>
          <div
            className="report-finding-marker"
            data-severity={finding.severity}
          />
          <div className="report-finding-body">
            <div className="report-finding-heading">
              <div>
                <span data-severity={finding.severity}>{finding.severity}</span>
                <code>{finding.ruleCode}</code>
              </div>
              <small>Impact {finding.scoreImpact}</small>
            </div>
            <h3>{finding.title}</h3>
            <p>{finding.description}</p>
            {finding.affectedUrl ? (
              <a
                href={finding.affectedUrl}
                target="_blank"
                rel="noreferrer"
                title={finding.affectedUrl}
                aria-label={`Open affected page ${finding.affectedUrl} in a new tab`}
              >
                {finding.affectedUrl}
              </a>
            ) : (
              <small className="report-sitewide-label">
                Site-wide pattern · {finding.occurrences} occurrence
                {finding.occurrences === 1 ? "" : "s"}
              </small>
            )}
            <details>
              <summary>How to fix</summary>
              <p>{finding.recommendation}</p>
            </details>
          </div>
        </article>
      ))}
      {total > findings.length ? (
        <p className="report-list-limit">
          Showing {findings.length} of {total} findings. Additional findings are
          retained in the audit record.
        </p>
      ) : null}
    </div>
  );
}

function UnavailableEngine({ label }: { label: string }) {
  return (
    <div className="report-unavailable-state">
      <span>N/A</span>
      <div>
        <h3>{label} analysis is unavailable</h3>
        <p>
          This engine did not run for this audit. No score or findings are being
          inferred.
        </p>
      </div>
    </div>
  );
}

function PriorityActionPlan({
  plan,
  sourceTruncated,
}: {
  plan: ActionPlan;
  sourceTruncated: boolean;
}) {
  return (
    <section
      className="priority-action-plan"
      aria-labelledby="action-plan-title"
    >
      <div className="priority-action-plan-heading">
        <div>
          <p className="page-eyebrow">Deterministic remediation plan</p>
          <h2 id="action-plan-title">What to fix first</h2>
          <span>
            Ranked by severity, score impact, affected-page coverage, and
            category importance.
          </span>
        </div>
        <strong>{plan.totalCandidateRules} prioritized rules</strong>
      </div>

      {plan.items.length === 0 ? (
        <div className="priority-action-empty">
          No failing findings were available to prioritize.
        </div>
      ) : (
        <div className="priority-action-groups">
          {plan.groups.map((group) => (
            <article
              className="priority-action-group"
              data-priority={group.priority}
              key={group.priority}
            >
              <header>
                <div>
                  <span>P{group.priority}</span>
                  <h3>{group.label}</h3>
                </div>
                <small>{group.items.length} actions</small>
              </header>
              <p>{group.description}</p>
              {group.items.length > 0 ? (
                <ol>
                  {group.items.map((item) => (
                    <li key={item.ruleCode}>
                      <div className="priority-action-item-heading">
                        <div>
                          <span>{item.category}</span>
                          <code>{item.ruleCode}</code>
                        </div>
                        <strong>{item.priorityScore}</strong>
                      </div>
                      <h4>{item.title}</h4>
                      <p>{item.recommendation}</p>
                      <div className="priority-action-evidence">
                        <span>
                          {item.affectedPageCount}/{item.evaluatedPageCount}{" "}
                          pages
                        </span>
                        <span>{item.affectedPagePercentage}% coverage</span>
                        <span>Impact {item.scoreImpact}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="priority-action-group-empty">
                  No actions in this priority.
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {plan.omittedRuleCount > 0 || sourceTruncated ? (
        <p className="priority-action-limit">
          {plan.omittedRuleCount > 0
            ? `${plan.omittedRuleCount} lower-ranked rules are retained in the issue explorer. `
            : ""}
          {sourceTruncated
            ? "The action-plan source reached its safety limit; use the issue explorer for the complete finding set."
            : ""}
        </p>
      ) : null}
    </section>
  );
}

export function AuditReport({
  report,
  activeTab,
}: {
  report: AuditReportView;
  activeTab: AuditReportTab;
}) {
  const scoreByCategory = new Map(
    report.scores.map((score) => [score.category, score]),
  );
  const overall = scoreByCategory.get("OVERALL");
  const activeCategory = typedTabCategory[activeTab];
  const activeCategoryScore = activeCategory
    ? scoreByCategory.get(activeCategory)
    : undefined;
  const auditDate = report.audit.completedAt ?? report.audit.createdAt;

  return (
    <div className="audit-report-page">
      <Link className="website-back-link" href="/dashboard/audits">
        ← Back to audits
      </Link>

      <header className="audit-report-header">
        <div>
          <div className="audit-report-heading-row">
            <p className="page-eyebrow">Audit report</p>
            <span>Completed</span>
          </div>
          <h1>{report.website.name}</h1>
          <a
            href={report.website.url}
            target="_blank"
            rel="noreferrer"
            title={report.website.url}
            aria-label={`Open ${report.website.url} in a new tab`}
          >
            {report.website.url} ↗
          </a>
        </div>
        <div className="audit-report-header-actions">
          <PdfReportButton auditId={report.audit.id} />
          <div className="audit-report-meta">
            <div>
              <span>Audit date</span>
              <strong>{formatDate(auditDate)}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{formatDuration(report.audit.durationMs)}</strong>
            </div>
            <div>
              <span>Audit type</span>
              <strong>{report.audit.type.replaceAll("_", " ")}</strong>
            </div>
          </div>
        </div>
      </header>

      <section className="audit-score-overview" aria-label="Audit scores">
        <article className="overall-score-card">
          <div>
            <p>Overall health</p>
            <h2>
              {overall?.evaluated
                ? scoreTone(overall.score) === "excellent"
                  ? "Excellent foundation"
                  : scoreTone(overall.score) === "good"
                    ? "Healthy with opportunities"
                    : scoreTone(overall.score) === "attention"
                      ? "Needs attention"
                      : "Priority fixes required"
                : "Score unavailable"}
            </h2>
            <span>
              Based only on engines evaluated during this audit. Unavailable
              categories do not affect the score.
            </span>
          </div>
          <ScoreGauge score={overall} label="Overall" />
        </article>

        <div className="category-score-grid">
          {scoreCategories.map(([category, label]) => (
            <article className="category-score-card" key={category}>
              <ScoreGauge
                compact
                score={scoreByCategory.get(category)}
                label={label}
              />
              <p>
                {scoreByCategory.get(category)?.evaluated
                  ? `${scoreByCategory.get(category)?.failingRuleCount ?? 0} failing rules`
                  : "Not evaluated"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="audit-report-stat-grid" aria-label="Audit summary">
        <article>
          <span>Pages discovered</span>
          <strong>{report.audit.pagesDiscovered}</strong>
        </article>
        <article>
          <span>Pages crawled</span>
          <strong>{report.audit.pagesCrawled}</strong>
        </article>
        <article data-severity="CRITICAL">
          <span>Critical</span>
          <strong>{report.issueCounts.CRITICAL}</strong>
        </article>
        <article data-severity="WARNING">
          <span>Warnings</span>
          <strong>{report.issueCounts.WARNING}</strong>
        </article>
        <article data-severity="RECOMMENDATION">
          <span>Recommendations</span>
          <strong>{report.issueCounts.RECOMMENDATION}</strong>
        </article>
        <article data-severity="PASSED">
          <span>Passed</span>
          <strong>{report.issueCounts.PASSED}</strong>
        </article>
      </section>

      <nav className="audit-report-tabs" aria-label="Audit report sections">
        {Object.entries(tabLabels).map(([tab, label]) => (
          <Link
            key={tab}
            href={
              tab === "issues"
                ? `/dashboard/audits/${report.audit.id}/issues`
                : tab === "pages"
                  ? `/dashboard/audits/${report.audit.id}/pages`
                  : `/dashboard/audits/${report.audit.id}?tab=${tab}`
            }
            aria-current={activeTab === tab ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="audit-report-content">
        {activeTab === "overview" ? (
          <>
            <PriorityActionPlan
              plan={report.actionPlan}
              sourceTruncated={report.actionPlanSourceTruncated}
            />
            <div className="report-section-heading">
              <div>
                <p className="page-eyebrow">Priority findings</p>
                <h2>Start with the highest-impact issues</h2>
              </div>
              <Link href={`/dashboard/audits/${report.audit.id}/issues`}>
                View all issues →
              </Link>
            </div>
            <FindingsList
              findings={report.findings}
              total={report.findingTotal}
              emptyMessage="No failing findings were recorded by the evaluated engines."
            />
          </>
        ) : null}

        {activeCategory ? (
          activeCategoryScore?.evaluated ? (
            <>
              <div className="report-section-heading">
                <div>
                  <p className="page-eyebrow">{tabLabels[activeTab]} audit</p>
                  <h2>{tabLabels[activeTab]} findings</h2>
                </div>
                <strong>{Math.round(activeCategoryScore.score)}/100</strong>
              </div>
              <FindingsList
                findings={report.findings}
                total={report.findingTotal}
                emptyMessage={`No ${tabLabels[activeTab].toLowerCase()} findings were recorded.`}
              />
            </>
          ) : (
            <UnavailableEngine label={tabLabels[activeTab]} />
          )
        ) : null}

        {activeTab === "issues" ? (
          <>
            <div className="report-section-heading">
              <div>
                <p className="page-eyebrow">All findings</p>
                <h2>{report.findingTotal} recorded issues and checks</h2>
              </div>
            </div>
            <FindingsList
              findings={report.findings}
              total={report.findingTotal}
              emptyMessage="No findings were recorded for this audit."
            />
          </>
        ) : null}

        {activeTab === "pages" ? (
          <>
            <div className="report-section-heading">
              <div>
                <p className="page-eyebrow">Crawl inventory</p>
                <h2>{report.pageTotal} crawled pages</h2>
              </div>
            </div>
            {report.pages.length > 0 ? (
              <div
                className="report-page-table-wrap"
                role="region"
                aria-label="Crawled pages table"
                tabIndex={0}
              >
                <table className="report-page-table">
                  <caption className="sr-only">
                    Pages crawled during this audit
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Page</th>
                      <th scope="col">Status</th>
                      <th scope="col">Indexable</th>
                      <th scope="col">Depth</th>
                      <th scope="col">Response</th>
                      <th scope="col">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pages.map((page) => (
                      <tr key={page.id}>
                        <td>
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            title={page.url}
                            aria-label={`Open crawled page ${page.url} in a new tab`}
                          >
                            <strong>{page.title ?? "Untitled page"}</strong>
                            <span>{page.url}</span>
                          </a>
                        </td>
                        <td>
                          <span
                            className="report-http-status"
                            data-status={
                              page.statusCode === null
                                ? "error"
                                : page.statusCode >= 400
                                  ? "error"
                                  : page.statusCode >= 300
                                    ? "redirect"
                                    : "success"
                            }
                          >
                            {page.statusCode ?? "Error"}
                          </span>
                        </td>
                        <td>{page.indexable ? "Yes" : "No"}</td>
                        <td>{page.depth}</td>
                        <td>
                          {page.loadTimeMs === null
                            ? "N/A"
                            : `${page.loadTimeMs} ms`}
                        </td>
                        <td>{formatBytes(page.pageSizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.pageTotal > report.pages.length ? (
                  <p className="report-list-limit">
                    Showing {report.pages.length} of {report.pageTotal} pages.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="report-empty-state">
                <h3>No page records available</h3>
                <p>The crawler did not persist any pages for this audit.</p>
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
