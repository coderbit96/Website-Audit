"use client";

import { RetryState } from "../../../components/errors/retry-state";

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RetryState
      error={error}
      reset={reset}
      title="Leads could not be loaded"
      description="Private lead records remain protected. Please try again."
    />
  );
}
