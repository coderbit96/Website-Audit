"use client";

export default function AuditsError({ reset }: { reset: () => void }) {
  return (
    <div className="audit-history-error">
      <span aria-hidden="true">!</span>
      <h1>Audit history could not be loaded</h1>
      <p>Your stored reports remain safe. Try loading the history again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
