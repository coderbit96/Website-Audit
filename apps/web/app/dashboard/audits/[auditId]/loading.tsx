export default function AuditReportLoading() {
  return (
    <div
      className="audit-report-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading audit report…</span>
      <div className="loading-line loading-eyebrow" />
      <div className="loading-line loading-title" />
      <section className="audit-progress-card audit-progress-loading">
        <div className="loading-line loading-copy" />
        <div className="loading-line loading-progress" />
        <div className="loading-line loading-copy" />
      </section>
      <section className="audit-progress-metrics">
        <div className="loading-block" />
        <div className="loading-block" />
        <div className="loading-block" />
      </section>
    </div>
  );
}
