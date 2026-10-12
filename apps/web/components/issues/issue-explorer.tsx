import Link from "next/link";

import type { IssueExplorerView } from "../../lib/issues/service";
import type { IssueFilterInput } from "../../lib/issues/validation";
import {
  issueCategories,
  issueSeverities,
  issueStatuses,
} from "../../lib/issues/validation";
import { IssueActions } from "./issue-actions";

type Issue = IssueExplorerView["items"][number];

const labelBySort = {
  IMPACT_DESC: "Highest impact",
  NEWEST: "Newest detected",
  OLDEST: "Oldest detected",
  TITLE_ASC: "Title A–Z",
  PAGE_ASC: "Affected page A–Z",
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatEvidence(value: unknown): string {
  if (value === null || value === undefined) return "No evidence was recorded.";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function buildQuery(
  filters: IssueFilterInput,
  changes: Partial<Record<keyof IssueFilterInput, string | number | undefined>>,
): string {
  const values: Record<string, string | number | undefined> = {
    website: filters.website,
    audit: filters.audit,
    category: filters.category,
    severity: filters.severity,
    status: filters.status,
    affectedPage: filters.affectedPage,
    search: filters.search,
    sort: filters.sort,
    page: filters.page,
    issue: filters.issue,
    ...changes,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

function IssueListItem({
  issue,
  selected,
  href,
}: {
  issue: Issue;
  selected: boolean;
  href: string;
}) {
  return (
    <Link
      className="issue-list-item"
      data-selected={selected || undefined}
      href={href}
      scroll={false}
    >
      <div className="issue-list-badges">
        <span data-severity={issue.severity}>{issue.severity}</span>
        <span data-status={issue.status}>{issue.status}</span>
      </div>
      <h3>{issue.title}</h3>
      <p title={issue.affectedUrl ?? undefined}>
        {issue.affectedUrl ?? `${issue.occurrences} site-wide occurrences`}
      </p>
      <div>
        <span>{issue.websiteName}</span>
        <code>{issue.ruleCode}</code>
      </div>
    </Link>
  );
}

export function IssueExplorer({
  result,
  filters,
  basePath,
  lockedAuditId,
  canManage,
}: {
  result: IssueExplorerView;
  filters: IssueFilterInput;
  basePath: string;
  lockedAuditId?: string;
  canManage: boolean;
}) {
  const selected =
    result.items.find((issue) => issue.id === filters.issue) ?? result.items[0];
  const firstNumber =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastNumber = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="issues-page">
      <section className="issues-heading">
        <div>
          <p className="page-eyebrow">
            {lockedAuditId ? "Audit findings" : "Workspace"}
          </p>
          <h1>{lockedAuditId ? "Audit issues" : "Issue explorer"}</h1>
          <p>
            Filter deterministic audit findings, inspect their evidence, and
            manage your team’s workflow status.
          </p>
        </div>
        {lockedAuditId ? (
          <Link href={`/dashboard/audits/${lockedAuditId}`}>
            Back to audit report
          </Link>
        ) : null}
      </section>

      <form className="issue-filter-panel" action={basePath} method="get">
        {lockedAuditId ? (
          <input type="hidden" name="audit" value={lockedAuditId} />
        ) : null}
        <div className="issue-search-field">
          <label htmlFor="issue-search">Search</label>
          <input
            id="issue-search"
            name="search"
            defaultValue={filters.search}
            placeholder="Title, rule code, URL…"
            maxLength={100}
          />
        </div>
        {!lockedAuditId ? (
          <>
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
              <span>Audit</span>
              <select name="audit" defaultValue={filters.audit ?? ""}>
                <option value="">All audits</option>
                {result.options.audits.map((audit) => (
                  <option key={audit.id} value={audit.id}>
                    {audit.websiteName} · {formatDate(audit.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          <span>Category</span>
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">All categories</option>
            {issueCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Severity</span>
          <select name="severity" defaultValue={filters.severity ?? ""}>
            <option value="">All severities</option>
            {issueSeverities.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">All statuses</option>
            {issueStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="issue-page-filter">
          <span>Affected page</span>
          <select name="affectedPage" defaultValue={filters.affectedPage ?? ""}>
            <option value="">All affected pages</option>
            {result.options.affectedPages.map((page) => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select name="sort" defaultValue={filters.sort}>
            {Object.entries(labelBySort).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="issue-filter-actions">
          <button type="submit">Apply filters</button>
          <Link href={basePath}>Reset</Link>
        </div>
      </form>

      <div className="issue-result-summary">
        <p>
          {result.total === 0
            ? "No issues"
            : `Showing ${firstNumber}–${lastNumber} of ${result.total} findings`}
        </p>
        <span>Workflow changes do not alter audit scores.</span>
      </div>

      {result.items.length === 0 ? (
        <section className="issue-empty-state">
          <span aria-hidden="true">⌕</span>
          <h2>No matching findings</h2>
          <p>
            Try clearing one or more filters, or run an audit to generate
            deterministic findings.
          </p>
          <Link href={basePath}>Clear filters</Link>
        </section>
      ) : (
        <section className="issue-explorer-layout">
          <div className="issue-list-panel" aria-label="Audit findings">
            {result.items.map((issue) => (
              <IssueListItem
                key={issue.id}
                issue={issue}
                selected={selected?.id === issue.id}
                href={`${basePath}?${buildQuery(filters, { issue: issue.id })}`}
              />
            ))}
            {result.pageCount > 1 ? (
              <nav className="issue-pagination" aria-label="Issue pages">
                {result.page > 1 ? (
                  <Link
                    href={`${basePath}?${buildQuery(filters, {
                      page: result.page - 1,
                      issue: undefined,
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
                    href={`${basePath}?${buildQuery(filters, {
                      page: result.page + 1,
                      issue: undefined,
                    })}`}
                  >
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </nav>
            ) : null}
          </div>

          {selected ? (
            <article className="issue-detail-panel">
              <header>
                <div className="issue-detail-badges">
                  <span data-severity={selected.severity}>
                    {selected.severity}
                  </span>
                  <span data-status={selected.status}>{selected.status}</span>
                  <span>{selected.category}</span>
                </div>
                <h2>{selected.title}</h2>
                <div className="issue-detail-context">
                  <span>{selected.websiteName}</span>
                  <span>{formatDate(selected.detectedAt)}</span>
                  <Link href={`/dashboard/audits/${selected.auditId}`}>
                    View audit
                  </Link>
                </div>
              </header>

              <IssueActions
                key={`${selected.id}-${selected.status}`}
                findingId={selected.id}
                status={selected.status}
                canManage={canManage}
              />

              <dl className="issue-detail-metadata">
                <div>
                  <dt>Rule code</dt>
                  <dd>
                    <code>{selected.ruleCode}</code>
                  </dd>
                </div>
                <div>
                  <dt>Score impact</dt>
                  <dd>{selected.scoreImpact}</dd>
                </div>
                <div>
                  <dt>Occurrences</dt>
                  <dd>{selected.occurrences}</dd>
                </div>
              </dl>

              <section>
                <h3>Affected URL</h3>
                {selected.affectedUrl ? (
                  <a
                    className="issue-affected-url"
                    href={selected.affectedUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={selected.affectedUrl}
                    aria-label={`Open affected page ${selected.affectedUrl} in a new tab`}
                  >
                    {selected.affectedUrl} ↗
                  </a>
                ) : (
                  <p>Site-wide finding without a single affected URL.</p>
                )}
              </section>

              <section>
                <h3>Why it matters</h3>
                <p>{selected.description}</p>
              </section>

              <section>
                <h3>Detected evidence</h3>
                <pre tabIndex={0} aria-label="Detected issue evidence">
                  {formatEvidence(selected.evidence)}
                </pre>
              </section>

              <section className="issue-recommendation">
                <h3>Recommended solution</h3>
                <p>{selected.recommendation}</p>
              </section>
            </article>
          ) : null}
        </section>
      )}
    </div>
  );
}
