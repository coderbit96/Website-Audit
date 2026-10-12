"use client";

import { useState } from "react";

function downloadFileName(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"\\/]+\.pdf)"/i);
  return match?.[1] ?? "website-audit-report.pdf";
}

export function PdfReportButton({ auditId }: { auditId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function generateReport(): Promise<void> {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/audits/${auditId}/reports/pdf`, {
        method: "POST",
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "The PDF report could not be generated.",
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadFileName(
        response.headers.get("Content-Disposition"),
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setState("idle");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The PDF report could not be generated.",
      );
      setState("error");
    }
  }

  return (
    <div className="pdf-report-action">
      <button
        type="button"
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        onClick={() => void generateReport()}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v3h14v-3" />
        </svg>
        {state === "loading" ? "Generating PDF…" : "Download PDF"}
      </button>
      {state === "error" ? <p role="alert">{message}</p> : null}
    </div>
  );
}
