export default function AuditsLoading() {
  return (
    <div
      className="audits-page audit-history-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading audit history…</span>
      <section className="websites-heading audit-history-heading">
        <div>
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-title" />
          <div className="report-skeleton report-skeleton-copy" />
        </div>
      </section>
      <div className="audit-history-loading-grid">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
    </div>
  );
}
