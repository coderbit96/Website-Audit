"use client";

import { useEffect } from "react";

type RetryStateProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  className?: string;
};

/** A deliberate, non-diagnostic fallback for recoverable rendering failures. */
export function RetryState({
  error,
  reset,
  title,
  description,
  className = "",
}: RetryStateProps) {
  useEffect(() => {
    // Next.js keeps server error details out of production clients. Record only
    // the framework digest here so a future error-monitoring integration can
    // correlate a report without exposing diagnostic data in the UI.
    if (error.digest)
      console.error("[ui] Render failure", { digest: error.digest });
  }, [error.digest]);

  return (
    <section
      className={`mx-auto flex min-h-[50vh] max-w-xl flex-col items-start justify-center gap-4 px-6 ${className}`}
      role="alert"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
        Temporary problem
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="max-w-prose text-sm leading-6 text-slate-600">
        {description}
      </p>
      <button
        className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        type="button"
        onClick={reset}
      >
        Try again
      </button>
    </section>
  );
}
