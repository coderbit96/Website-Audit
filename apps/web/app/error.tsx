"use client";

import { RetryState } from "../components/errors/retry-state";

export default function RootError({
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
      title="This page could not be loaded"
      description="Your data has not been changed. Please try again in a moment."
    />
  );
}
