import Link from "next/link";

import type { AuditHistoryView } from "../../lib/audits/history";
import {
  auditHistoryStatuses,
  auditHistoryTypes,
  type AuditHistoryFilterInput,
} from "../../lib/audits/history-validation";
import { LazyAuditScoreHistoryChart } from "./lazy-audit-score-history-chart";

type HistoryItem = AuditHistoryView["items"][number];
type ScoreCategory = keyof HistoryItem["scores"];

const scoreColumns = [
  ["OVERALL", "Overall"],
  ["SEO", "SEO"],
  ["TECHNICAL", "Technical"],
  ["PERFORMANCE", "Performance"],
  ["ACCESSIBILITY", "Accessibility"],
  ["SECURITY", "Security"],
] as const satisfies ReadonlyArray<readonly [ScoreCategory, string]>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "N/A";
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function scoreTone(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "attention";
  return "critical";
}

function ScoreValue({ score }: { score: number | null }) {
  if (score === null) return <span className="audit-history-na">N/A</span>;
  return (
    <span className="audit-history-score" data-tone={scoreTone(score)}>
      {Math.round(score)}
    </span>
  );
}

function ScoreChange({ change }: { change: number | null }) {
  if (change === null) return null;
  const rounded = Math.round(change);
  return (
    <small
      className="audit-score-change"
      data-direction={rounded > 0 ? "up" : rounded < 0 ? "down" : "flat"}
      title="Change from the previous completed audit for this website"
    >
      {rounded > 0 ? "+" : ""}
      {rounded}
    </small>
  );
}

function buildQuery(
  filters: AuditHistoryFilterInput,
  changes: Partial<
    Record<keyof AuditHistoryFilterInput, string | number | undefined>
  >,
): string {
  const values = {
    website: filters.website,
    status: filters.status,
    type: filters.type,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    ...changes,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

function auditActionLabel(status: HistoryItem["status"]): string {
  if (status === "COMPLETED") return "Open report";
  if (["FAILED", "CANCELLED"].includes(status)) return "Review audit";
  return "View progress";
}

export function AuditHistory({
  result,
  filters,
  canManage,
}: {
  result: AuditHistoryView;
  filters: AuditHistoryFilterInput;
  canManage: boolean;
}) {
  const firstNumber =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastNumber = Math.min(result.total, result.page * result.pageSize);
  const hasFilters = Boolean(
    filters.website ||
    filters.status ||
    filters.type ||
    filters.from ||
    filters.to,
  );

  return (
    <div className="audits-page audit-history-page">
      <section className="websites-heading audit-history-heading">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1>Audit history</h1>
          <p>
            Reopen past reports, compare category scores, and follow website
            health over time.
          </p>
        </div>
        {canManage ? (
          <Link className="app-action-button" href="/dashboard/audits/new">
            New audit
          </Link>
        ) : null}
      </section>

      <form
        className="audit-history-filters"
        action="/dashboard/audits"
        method="get"
      >
        <label>
          <span>Website</span>
          <select name="website" defaultValue={filters.website ?? ""}>
            <option value="">All websites</option>
            {result.options.websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">All statuses</option>
            {auditHistoryStatuses.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Audit type</span>
          <select name="type" defaultValue={filters.type ?? ""}>
            <option value="">All audit types</option>
            {auditHistoryTypes.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label>
          <span>To</span>
          <input name="to" type="date" defaultValue={filters.to} />
        </label>
        <div className="audit-history-filter-actions">
          <button type="submit">Apply filters</button>
          <Link href="/dashboard/audits">Reset</Link>
        </div>
      </form>

      <section className="audit-history-trends">
        <header>
          <div>
            <p className="page-eyebrow">Score history</p>
            <h2>
              {result.trend.website
                ? result.trend.website.name
                : "Website trends"}
            </h2>
          </div>
          {result.trend.website && !filters.website ? (
            <Link
              href={`/dashboard/audits?${buildQuery(filters, {
                website: result.trend.website.id,
                page: 1,
              })}`}
            >
              Focus this website
            </Link>
          ) : null}
        </header>
        {result.trend.points.length >= 2 ? (
          <LazyAuditScoreHistoryChart points={result.trend.points} />
        ) : (
          <div className="audit-history-trend-empty">
            <span aria-hidden="true">↗</span>
            <div>
              <h3>More history is needed</h3>
              <p>
                Run at least two completed audits for the same website to see
                score trends and changes.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="audit-history-summary">
        <p>
          {result.total === 0
            ? "No audits"
            : `Showing ${firstNumber}–${lastNumber} of ${result.total} audits`}
        </p>
        <span>Score changes compare consecutive completed website audits.</span>
      </div>

      {result.items.length === 0 ? (
        <section className="audit-history-empty">
          <span aria-hidden="true">◎</span>
          <h2>{hasFilters ? "No matching audits" : "No audits yet"}</h2>
          <p>
            {hasFilters
              ? "Clear one or more filters to see additional audit history."
              : "Start an audit to create the first real report for this workspace."}
          </p>
          {hasFilters || canManage ? (
            <Link
              href={hasFilters ? "/dashboard/audits" : "/dashboard/audits/new"}
            >
              {hasFilters ? "Clear filters" : "Create an audit"}
            </Link>
          ) : (
            <small>Ask a workspace owner or admin to create an audit.</small>
          )}
        </section>
      ) : (
        <section className="audit-history-table-card">
          <div
            className="audit-history-table-scroll"
            role="region"
            aria-label="Audit history table"
            tabIndex={0}
          >
            <table className="audit-history-table">
              <caption className="sr-only">
                Historical audits and category score results
              </caption>
              <thead>
                <tr>
                  <th scope="col">Website</th>
                  <th scope="col">Date</th>
                  {scoreColumns.map(([, label]) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                  <th scope="col">Pages</th>
                  <th scope="col">Status</th>
                  <th scope="col">Duration</th>
                  <th scope="col" aria-label="Audit action" />
                </tr>
              </thead>
              <tbody>
                {result.items.map((audit) => (
                  <tr key={audit.id}>
                    <td>
                      <div className="audit-history-website">
                        <Link href={`/dashboard/websites/${audit.website.id}`}>
                          {audit.website.name}
                        </Link>
                        <small>{titleCase(audit.type)}</small>
                      </div>
                    </td>
                    <td>
                      <time dateTime={audit.completedAt ?? audit.createdAt}>
                        {formatDate(audit.completedAt ?? audit.createdAt)}
                      </time>
                    </td>
                    {scoreColumns.map(([category]) => (
                      <td key={category}>
                        <div className="audit-history-score-cell">
                          <ScoreValue score={audit.scores[category]} />
                          {category === "OVERALL" ? (
                            <ScoreChange change={audit.overallScoreChange} />
                          ) : null}
                        </div>
                      </td>
                    ))}
                    <td>{audit.pagesCrawled.toLocaleString("en-US")}</td>
                    <td>
                      <span
                        className="audit-history-status"
                        data-status={audit.status}
                      >
                        {titleCase(audit.status)}
                      </span>
                    </td>
                    <td>{formatDuration(audit.durationMs)}</td>
                    <td>
                      <Link
                        className="audit-history-open"
                        href={`/dashboard/audits/${audit.id}`}
                      >
                        {auditActionLabel(audit.status)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.pageCount > 1 ? (
            <nav className="audit-history-pagination" aria-label="Audit pages">
              {result.page > 1 ? (
                <Link
                  href={`/dashboard/audits?${buildQuery(filters, {
                    page: result.page - 1,
                  })}`}
                >
                  Previous
                </Link>
              ) : (
                <span>Previous</span>
              )}
              <strong>
                {result.page} / {result.pageCount}
              </strong>
              {result.page < result.pageCount ? (
                <Link
                  href={`/dashboard/audits?${buildQuery(filters, {
                    page: result.page + 1,
                  })}`}
                >
                  Next
                </Link>
              ) : (
                <span>Next</span>
              )}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
