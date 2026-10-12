export default function DashboardSectionLoading() {
  return (
    <div
      className="placeholder-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading workspace section…</span>
      <section className="placeholder-heading">
        <div className="report-skeleton report-skeleton-short" />
        <div className="report-skeleton report-skeleton-title" />
        <div className="report-skeleton report-skeleton-copy" />
      </section>
      <section className="feature-foundation-state" aria-hidden="true">
        <div className="report-skeleton section-loading-icon" />
        <div className="section-loading-copy">
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-copy" />
        </div>
      </section>
    </div>
  );
}
