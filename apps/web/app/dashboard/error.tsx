"use client";

import { RetryState } from "../../components/errors/retry-state";

export default function DashboardError({
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
      title="Your workspace could not be loaded"
      description="The dashboard is temporarily unavailable. Your audit data remains safe."
    />
  );
}
