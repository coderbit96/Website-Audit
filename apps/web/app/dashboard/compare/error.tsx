"use client";

export default function AuditComparisonError({ reset }: { reset: () => void }) {
  return (
    <div className="audit-compare-error">
      <span aria-hidden="true">!</span>
      <h1>The audit comparison could not be loaded</h1>
      <p>Your stored audit results remain unchanged. Try loading them again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
