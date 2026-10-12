"use client";

import { RetryState } from "../../components/errors/retry-state";

export default function AdminError({
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
      title="Administration data could not be loaded"
      description="No system settings or usage credits were changed. Try again when the service is available."
    />
  );
}
