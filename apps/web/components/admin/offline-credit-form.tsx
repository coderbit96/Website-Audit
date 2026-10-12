"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Recipient = {
  userId: string;
  label: string;
  workspaces: readonly { id: string; name: string }[];
};

const metrics = [
  ["AUDITS", "Audit runs"],
  ["PAGES_CRAWLED", "Crawled pages"],
  ["WEBSITES", "Active websites"],
  ["REPORT_GENERATIONS", "Report generations"],
  ["SCHEDULED_AUDITS", "Scheduled audits"],
  ["CLIENTS", "Clients"],
] as const;

export function OfflineCreditForm({
  recipients,
}: {
  recipients: readonly Recipient[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<{
    query: string;
    recipients: readonly Recipient[];
  } | null>(null);
  const normalizedSearch = search.trim();
  const isSearching =
    Boolean(normalizedSearch) && searchResult?.query !== normalizedSearch;
  const targets = useMemo(() => {
    const availableRecipients = normalizedSearch
      ? searchResult?.query === normalizedSearch
        ? searchResult.recipients
        : []
      : recipients;
    return availableRecipients.flatMap((recipient) =>
      recipient.workspaces.map((workspace) => ({
        value: `${recipient.userId}:${workspace.id}`,
        label: `${recipient.label} · ${workspace.name}`,
      })),
    );
  }, [normalizedSearch, recipients, searchResult]);
  const [target, setTarget] = useState("");
  const selectedTarget = targets.some((option) => option.value === target)
    ? target
    : (targets[0]?.value ?? "");
  const [metric, setMetric] =
    useState<(typeof metrics)[number][0]>("PAGES_CRAWLED");
  const [quantity, setQuantity] = useState("100");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingRequest = useRef<{
    signature: string;
    requestId: string;
  } | null>(null);

  useEffect(() => {
    const normalized = search.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/admin/credit-recipients?search=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Recipient search failed.");
        const result = (await response.json()) as { data?: Recipient[] };
        setSearchResult({ query: normalized, recipients: result.data ?? [] });
      } catch {
        if (controller.signal.aborted) return;
        setSearchResult({ query: normalized, recipients: [] });
        setNotice({
          type: "error",
          message: "Users could not be searched. Try again.",
        });
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [recipientUserId, workspaceId] = selectedTarget.split(":");
    const parsedQuantity = Number(quantity);
    if (
      !recipientUserId ||
      !workspaceId ||
      !targets.some((option) => option.value === selectedTarget) ||
      !Number.isInteger(parsedQuantity)
    ) {
      setNotice({
        type: "error",
        message:
          "Select a recipient workspace and enter a whole-number credit.",
      });
      return;
    }
    setIsSaving(true);
    setNotice(null);
    const requestBody = {
      recipientUserId,
      workspaceId,
      metric,
      quantity: parsedQuantity,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const signature = JSON.stringify(requestBody);
    const requestId =
      pendingRequest.current?.signature === signature
        ? pendingRequest.current.requestId
        : crypto.randomUUID();
    pendingRequest.current = { signature, requestId };
    try {
      const response = await fetch("/api/admin/usage-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestBody,
          requestId,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        data?: { periodEnd: string };
      };
      if (!response.ok || !result.data) {
        if (response.status === 409 || response.status === 400) {
          pendingRequest.current = null;
        }
        setNotice({
          type: "error",
          message: result.error ?? "The credit could not be granted.",
        });
        return;
      }
      setNotice({
        type: "success",
        message: `Credit granted for the active billing period through ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(result.data.periodEnd))}.`,
      });
      pendingRequest.current = null;
      setNote("");
      router.refresh();
    } catch {
      setNotice({
        type: "error",
        message:
          "The credit could not be granted. Check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="offline-credit-card">
      <header>
        <p className="page-eyebrow">Offline billing support</p>
        <h2>Grant usage credit</h2>
        <p>
          This extends the chosen workspace&apos;s real allowance for its
          current billing period. It does not alter recorded usage or plan
          policy.
        </p>
      </header>
      <div className="mt-4">
        <label className="grid gap-1 text-sm font-semibold">
          <span>Find a user</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--app-muted)]" role="status">
          {isSearching
            ? "Searching users…"
            : `Showing up to 25 matching users. ${targets.length} workspace choices.`}
        </p>
      </div>
      {targets.length === 0 ? (
        <p className="offline-credit-empty">
          {isSearching
            ? "Searching eligible workspaces…"
            : "No eligible user workspaces match your search."}
        </p>
      ) : (
        <form onSubmit={submit} aria-busy={isSaving || isSearching}>
          <label>
            <span>User and workspace</span>
            <select
              value={selectedTarget}
              onChange={(event) => setTarget(event.target.value)}
            >
              {targets.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="offline-credit-fields">
            <label>
              <span>Allowance</span>
              <select
                value={metric}
                onChange={(event) =>
                  setMetric(event.target.value as (typeof metrics)[number][0])
                }
              >
                {metrics.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Credit quantity</span>
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span>Internal note (optional)</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={240}
              placeholder="Reason for this manual allowance"
            />
          </label>
          {notice ? (
            <p
              className="offline-credit-message"
              data-type={notice.type}
              role={notice.type === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}
          <button type="submit" disabled={isSaving || isSearching}>
            {isSaving ? "Granting credit…" : "Grant usage credit"}
          </button>
        </form>
      )}
    </section>
  );
}
