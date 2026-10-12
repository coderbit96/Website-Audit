export default function AuditPagesLoading() {
  return (
    <div
      className="page-explorer-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading crawled pages…</span>
      <div className="report-skeleton report-skeleton-short" />
      <div className="report-skeleton report-skeleton-title" />
      <div className="page-explorer-loading">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
    </div>
  );
}
