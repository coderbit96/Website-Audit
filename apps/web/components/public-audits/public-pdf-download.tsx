"use client";

import { useState } from "react";

export function PublicPdfDownload({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function download(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/public-audits/${token}/pdf`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ?? "The PDF could not be generated. Please try again.",
        );
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName =
        disposition.match(/filename="([a-z0-9.-]+)"/i)?.[1] ??
        "website-audit.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setError("The PDF service is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing PDF…" : "Download PDF"}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
