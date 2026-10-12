"use client";

export default function AuditReportError({ reset }: { reset: () => void }) {
  return (
    <div className="audit-report-page">
      <section className="website-page-error" role="alert">
        <span>!</span>
        <h1>Audit report could not be loaded</h1>
        <p>
          The report data is temporarily unavailable. Check the database
          connection and try again.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
