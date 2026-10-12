"use client";

import { RetryState } from "../../../components/errors/retry-state";

export default function DashboardSectionError({
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
      title="This workspace section could not be loaded"
      description="No changes were made. Please try again in a moment."
    />
  );
}
