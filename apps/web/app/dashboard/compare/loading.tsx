export default function AuditComparisonLoading() {
  return (
    <div
      className="audit-compare-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading audit comparison…</span>
      <section className="websites-heading audit-compare-heading">
        <div>
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-title" />
          <div className="report-skeleton report-skeleton-copy" />
        </div>
      </section>
      <div className="audit-compare-loading-grid">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
    </div>
  );
}
