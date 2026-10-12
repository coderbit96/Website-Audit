import Link from "next/link";

import type { SuperAdminLeadListView } from "../../lib/leads/service";
import {
  publicLeadServiceLabels,
  publicLeadServices,
  type LeadListFilterInput,
} from "../../lib/leads/validation";

const storedServiceToPublic = {
  FULL_REPORT: "full-report",
  WEBSITE_FIX: "website-fix",
  SEO: "seo",
  PERFORMANCE: "performance",
  CONTACT: "contact",
} as const;

function buildQuery(filters: LeadListFilterInput, page: number): string {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.requestedService)
    query.set("requestedService", filters.requestedService);
  if (filters.source) query.set("source", filters.source);
  query.set("page", String(page));
  return query.toString();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function displayHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LeadList({
  result,
  filters,
  basePath = "/dashboard/leads",
}: {
  result: SuperAdminLeadListView;
  filters: LeadListFilterInput;
  basePath?: string;
}) {
  const first =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.total, result.page * result.pageSize);
  const hasFilters = Boolean(
    filters.search || filters.requestedService || filters.source,
  );

  return (
    <div className="lead-admin-page">
      <section className="lead-admin-heading">
        <div>
          <p className="page-eyebrow">Super Admin</p>
          <h1>Lead inbox</h1>
          <p>
            Private service requests captured from completed public website
            audits.
          </p>
        </div>
        <span>Private data</span>
      </section>

      <form className="lead-admin-filters" action={basePath} method="get">
        <label>
          <span>Search</span>
          <input
            type="search"
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Name, email, or website"
            maxLength={100}
          />
        </label>
        <label>
          <span>Requested service</span>
          <select
            name="requestedService"
            defaultValue={filters.requestedService ?? ""}
          >
            <option value="">All services</option>
            {publicLeadServices.map((service) => (
              <option key={service} value={service}>
                {publicLeadServiceLabels[service]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Source</span>
          <select name="source" defaultValue={filters.source ?? ""}>
            <option value="">All sources</option>
            <option value="public-audit">Public audit</option>
          </select>
        </label>
        <div className="lead-admin-filter-actions">
          <button type="submit">Apply</button>
          <Link href={basePath}>Reset</Link>
        </div>
      </form>

      <div className="lead-admin-summary">
        <strong>
          {result.total === 0
            ? "No leads"
            : `Showing ${first}–${last} of ${result.total}`}
        </strong>
        <span>Contact details are visible only to global administrators.</span>
      </div>

      {result.items.length === 0 ? (
        <section className="lead-admin-empty">
          <span aria-hidden="true">◎</span>
          <h2>{hasFilters ? "No matching leads" : "No leads captured yet"}</h2>
          <p>
            {hasFilters
              ? "Clear one or more filters to review other captured requests."
              : "Completed public audit visitors can submit a service request from their results page."}
          </p>
          {hasFilters ? <Link href={basePath}>Clear filters</Link> : null}
        </section>
      ) : (
        <section className="lead-admin-table-card">
          <div
            className="lead-admin-table-scroll"
            role="region"
            aria-label="Captured leads table"
            tabIndex={0}
          >
            <table className="lead-admin-table">
              <caption className="sr-only">Captured public audit leads</caption>
              <thead>
                <tr>
                  <th scope="col">Contact</th>
                  <th scope="col">Website / audit</th>
                  <th scope="col">Score</th>
                  <th scope="col">Requested service</th>
                  <th scope="col">Top problems</th>
                  <th scope="col">Captured</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((lead) => {
                  const publicService =
                    storedServiceToPublic[lead.requestedService];
                  return (
                    <tr key={lead.id}>
                      <td>
                        <div className="lead-admin-contact">
                          <strong>{lead.name}</strong>
                          <a href={`mailto:${lead.email}`}>{lead.email}</a>
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                          ) : (
                            <small>No phone provided</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="lead-admin-website">
                          <a
                            href={lead.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={lead.websiteUrl}
                            aria-label={`Open ${lead.websiteUrl} in a new tab`}
                          >
                            {displayHostname(lead.websiteUrl)} ↗
                          </a>
                          <code title={lead.auditId}>
                            Audit {lead.auditId.slice(-8)}
                          </code>
                          <small>Public audit</small>
                        </div>
                      </td>
                      <td>
                        {lead.auditScore === null ? (
                          <span className="lead-admin-score" data-unavailable>
                            N/A
                          </span>
                        ) : (
                          <span className="lead-admin-score">
                            {Math.round(lead.auditScore)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="lead-admin-service">
                          {publicLeadServiceLabels[publicService]}
                        </span>
                      </td>
                      <td>
                        {lead.topDetectedProblems.length > 0 ? (
                          <ul className="lead-admin-problems">
                            {lead.topDetectedProblems.map((problem) => (
                              <li key={`${problem.category}-${problem.title}`}>
                                <span data-severity={problem.severity}>
                                  {problem.severity}
                                </span>
                                <span>{problem.title}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <small className="lead-admin-muted">
                            No failing issue in sample
                          </small>
                        )}
                      </td>
                      <td>
                        <time dateTime={lead.createdAt}>
                          {formatDate(lead.createdAt)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.pageCount > 1 ? (
            <nav className="lead-admin-pagination" aria-label="Lead pages">
              {result.page > 1 ? (
                <Link
                  href={`${basePath}?${buildQuery(filters, result.page - 1)}`}
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
                  href={`${basePath}?${buildQuery(filters, result.page + 1)}`}
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
