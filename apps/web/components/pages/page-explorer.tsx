import Link from "next/link";

import type { PageExplorerView } from "../../lib/pages/service";
import type { PageExplorerQuery } from "../../lib/pages/validation";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function pageHref(
  basePath: string,
  page: number,
  search: string | undefined,
): string {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set("search", search);
  return `${basePath}?${query.toString()}`;
}

function statusTone(statusCode: number | null): string {
  if (statusCode === null || statusCode >= 400) return "error";
  if (statusCode >= 300) return "redirect";
  return "success";
}

export function PageExplorer({
  result,
  query,
}: {
  result: PageExplorerView;
  query: PageExplorerQuery;
}) {
  const basePath = `/dashboard/audits/${result.audit.id}/pages`;
  const firstNumber =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastNumber = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="page-explorer-page">
      <Link
        className="website-back-link"
        href={`/dashboard/audits/${result.audit.id}`}
      >
        ← Back to audit report
      </Link>
      <header className="page-explorer-heading">
        <div>
          <p className="page-eyebrow">Crawl inventory</p>
          <h1>Pages</h1>
          <p>
            {result.website.name} · {result.total} crawled page
            {result.total === 1 ? "" : "s"}
          </p>
        </div>
        <a href={result.website.url} target="_blank" rel="noreferrer">
          Visit website ↗
        </a>
      </header>

      <form className="page-explorer-toolbar" action={basePath} method="get">
        <label htmlFor="page-search">Search pages</label>
        <div>
          <input
            id="page-search"
            name="search"
            defaultValue={query.search}
            placeholder="Search URL or title…"
            maxLength={200}
          />
          <button type="submit">Search</button>
          {query.search ? <Link href={basePath}>Clear</Link> : null}
        </div>
      </form>

      <section className="page-explorer-panel">
        <div className="page-explorer-summary">
          <p>
            {result.total === 0
              ? "No pages"
              : `Showing ${firstNumber}–${lastNumber} of ${result.total} pages`}
          </p>
          <span>25 pages per view</span>
        </div>

        {result.pages.length === 0 ? (
          <div className="page-explorer-empty">
            <span aria-hidden="true">⌕</span>
            <h2>No matching pages</h2>
            <p>
              {query.search
                ? "Try a different URL or title search."
                : "This audit did not persist any crawled pages."}
            </p>
            {query.search ? <Link href={basePath}>Clear search</Link> : null}
          </div>
        ) : (
          <div
            className="page-explorer-table-wrap"
            role="region"
            aria-label="Crawled pages table"
            tabIndex={0}
          >
            <table className="page-explorer-table">
              <caption className="sr-only">
                Crawled pages with response, indexability, and issue data
              </caption>
              <thead>
                <tr>
                  <th scope="col">URL</th>
                  <th scope="col">Status code</th>
                  <th scope="col">Title</th>
                  <th scope="col">Indexability</th>
                  <th scope="col">Depth</th>
                  <th scope="col">Response time</th>
                  <th scope="col">Page size</th>
                  <th scope="col">SEO issues</th>
                  <th scope="col">Technical issues</th>
                </tr>
              </thead>
              <tbody>
                {result.pages.map((page) => {
                  const detailHref = `${basePath}/${page.id}`;
                  return (
                    <tr key={page.id}>
                      <td>
                        <Link
                          className="page-url-cell"
                          href={detailHref}
                          title={page.url}
                          aria-label={`View crawl details for ${page.url}`}
                        >
                          {page.url}
                        </Link>
                      </td>
                      <td>
                        <span
                          className="report-http-status"
                          data-status={statusTone(page.statusCode)}
                        >
                          {page.statusCode ?? "Error"}
                        </span>
                      </td>
                      <td>
                        <Link className="page-title-cell" href={detailHref}>
                          {page.title ?? "Untitled page"}
                        </Link>
                      </td>
                      <td>
                        <span data-indexable={page.indexable ?? "unknown"}>
                          {page.indexable === null
                            ? "N/A"
                            : page.indexable
                              ? "Indexable"
                              : "Not indexable"}
                        </span>
                      </td>
                      <td>{page.depth}</td>
                      <td>
                        {page.responseTimeMs === null
                          ? "N/A"
                          : `${page.responseTimeMs} ms`}
                      </td>
                      <td>{formatBytes(page.pageSizeBytes)}</td>
                      <td>
                        {page.seoIssueCount > 0 ? (
                          <Link
                            className="page-issue-count"
                            data-has-issues="true"
                            href={`/dashboard/audits/${result.audit.id}/issues?category=SEO&affectedPage=${encodeURIComponent(page.url)}`}
                          >
                            {page.seoIssueCount}
                          </Link>
                        ) : (
                          <span className="page-issue-count">0</span>
                        )}
                      </td>
                      <td>
                        {page.technicalIssueCount > 0 ? (
                          <Link
                            className="page-issue-count"
                            data-has-issues="true"
                            href={`/dashboard/audits/${result.audit.id}/issues?category=TECHNICAL&affectedPage=${encodeURIComponent(page.url)}`}
                          >
                            {page.technicalIssueCount}
                          </Link>
                        ) : (
                          <span className="page-issue-count">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {result.pageCount > 1 ? (
          <nav className="page-explorer-pagination" aria-label="Page results">
            {result.page > 1 ? (
              <Link href={pageHref(basePath, result.page - 1, query.search)}>
                ← Previous
              </Link>
            ) : (
              <span>← Previous</span>
            )}
            <strong>
              Page {result.page} of {result.pageCount}
            </strong>
            {result.page < result.pageCount ? (
              <Link href={pageHref(basePath, result.page + 1, query.search)}>
                Next →
              </Link>
            ) : (
              <span>Next →</span>
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
