"use client";

import { RetryState } from "../../../components/errors/retry-state";

export default function ClientsError({
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
      title="Clients could not be loaded"
      description="Your client records and website associations remain unchanged."
    />
  );
}
