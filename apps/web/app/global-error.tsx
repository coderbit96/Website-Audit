"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error.digest)
      console.error("[ui] Global render failure", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#f8fafc",
          color: "#0f172a",
          display: "flex",
          fontFamily: "system-ui, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <p style={{ color: "#0e7490", fontWeight: 700 }}>SITESIGNAL</p>
          <h1>Something went wrong</h1>
          <p>
            We could not load this part of the application. Your data has not
            been changed.
          </p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
