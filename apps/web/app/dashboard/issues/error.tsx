"use client";

export default function IssuesError({ reset }: { reset: () => void }) {
  return (
    <div className="issue-error-state">
      <span aria-hidden="true">!</span>
      <h1>Issues could not be loaded</h1>
      <p>The audit data remains safe. Try loading the issue explorer again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
