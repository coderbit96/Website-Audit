export default function IssuesLoading() {
  return (
    <div
      className="issues-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading issues…</span>
      <section className="issues-heading">
        <div>
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-title" />
          <div className="report-skeleton report-skeleton-copy" />
        </div>
      </section>
      <div className="issue-loading-grid">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
    </div>
  );
}
