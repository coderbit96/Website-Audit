export default function AdminLoading() {
  return (
    <div
      className="admin-overview"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading system administration…</span>
      <section className="admin-overview-heading">
        <div>
          <div className="report-skeleton report-skeleton-short" />
          <div className="report-skeleton report-skeleton-title" />
        </div>
      </section>
      <div className="admin-loading-grid" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div className="report-skeleton" key={item} />
        ))}
      </div>
    </div>
  );
}
