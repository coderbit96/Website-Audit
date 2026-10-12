export default function DashboardLoading() {
  return (
    <div
      className="overview-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading dashboard…</span>
      <section className="overview-heading">
        <div>
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-title" />
          <div className="report-skeleton report-skeleton-copy" />
        </div>
      </section>
      <div className="overview-loading-grid" aria-hidden="true">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
      <div
        className="report-skeleton overview-loading-activity"
        aria-hidden="true"
      />
    </div>
  );
}
