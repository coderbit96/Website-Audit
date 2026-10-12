"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ClientApiError, ClientDetailView } from "../../lib/clients/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function scoreLabel(score: number | null): string {
  return score === null ? "N/A" : String(Math.round(score));
}

export function ClientDetail({
  initialDetail,
  canManage,
}: {
  initialDetail: ClientDetailView;
  canManage: boolean;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [selectedIds, setSelectedIds] = useState(
    () =>
      new Set(
        initialDetail.websites
          .filter((site) => site.selected)
          .map((site) => site.id),
      ),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const selectedCount = selectedIds.size;
  const selectionChanged = useMemo(() => {
    const original = new Set(
      detail.websites.filter((site) => site.selected).map((site) => site.id),
    );
    return (
      original.size !== selectedIds.size ||
      [...original].some((id) => !selectedIds.has(id))
    );
  }, [detail.websites, selectedIds]);

  function toggleWebsite(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveWebsites() {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/clients/${detail.client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "websites",
          websiteIds: [...selectedIds],
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        { data: ClientDetailView } | ClientApiError | null;
      if (!response.ok || !payload || !("data" in payload)) {
        throw new Error(
          payload && "error" in payload
            ? payload.error
            : "Unable to update website assignments.",
        );
      }
      setDetail(payload.data);
      setSelectedIds(
        new Set(
          payload.data.websites
            .filter((site) => site.selected)
            .map((site) => site.id),
        ),
      );
      setNotice({
        type: "success",
        message: "Website assignments were updated.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update website assignments.",
      });
    } finally {
      setSaving(false);
    }
  }

  const { client } = detail;
  return (
    <div className="client-detail-page">
      <Link className="client-back-link" href="/dashboard/clients">
        ← Back to clients
      </Link>
      <section className="client-detail-hero">
        <span className="client-detail-avatar">
          {client.companyName.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <div className="client-detail-title-line">
            <h1>{client.companyName}</h1>
            <span data-active={client.isActive}>
              {client.isActive ? "Active" : "Archived"}
            </span>
          </div>
          <p>{client.contactName ?? "No primary contact set"}</p>
        </div>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>
              {client.email ? (
                <a href={`mailto:${client.email}`}>{client.email}</a>
              ) : (
                "Not added"
              )}
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              {client.phone ? (
                <a href={`tel:${client.phone}`}>{client.phone}</a>
              ) : (
                "Not added"
              )}
            </dd>
          </div>
          <div>
            <dt>Client since</dt>
            <dd>{formatDate(client.createdAt)}</dd>
          </div>
        </dl>
      </section>

      {notice ? (
        <div
          className="client-notice"
          data-type={notice.type}
          role={notice.type === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true">
            {notice.type === "success" ? "✓" : "!"}
          </span>
          <p>{notice.message}</p>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {client.notes ? (
        <section className="client-note-card">
          <p className="page-eyebrow">Workspace notes</p>
          <p>{client.notes}</p>
        </section>
      ) : null}

      <section className="client-detail-grid">
        <article className="client-detail-card client-websites-card">
          <div className="client-card-heading">
            <div>
              <p className="page-eyebrow">Portfolio</p>
              <h2>Websites</h2>
              <p>{selectedCount} assigned to this client</p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => void saveWebsites()}
                disabled={!selectionChanged || saving || !client.isActive}
              >
                {saving ? "Saving…" : "Save assignments"}
              </button>
            ) : null}
          </div>
          {detail.websites.length === 0 ? (
            <div className="client-card-empty">
              <p>No available websites yet.</p>
              <Link href="/dashboard/websites">Add a website</Link>
            </div>
          ) : (
            <div className="client-website-options">
              {detail.websites.map((website) => (
                <label
                  key={website.id}
                  data-selected={selectedIds.has(website.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(website.id)}
                    onChange={() => toggleWebsite(website.id)}
                    disabled={!canManage || !client.isActive || saving}
                  />
                  <span>
                    <strong>{website.name}</strong>
                    <small title={website.url}>{website.url}</small>
                  </span>
                  <em data-active={website.isActive}>
                    {website.isActive ? "Active" : "Archived"}
                  </em>
                </label>
              ))}
            </div>
          )}
          {!client.isActive ? (
            <p className="client-inline-note">
              Restore this client before changing website assignments.
            </p>
          ) : null}
        </article>

        <article className="client-detail-card">
          <div className="client-card-heading">
            <div>
              <p className="page-eyebrow">Latest activity</p>
              <h2>Audits</h2>
              <p>Most recent 25 audits</p>
            </div>
          </div>
          {detail.audits.length === 0 ? (
            <div className="client-card-empty">
              <p>No audits for assigned websites yet.</p>
            </div>
          ) : (
            <div className="client-history-list">
              {detail.audits.map((audit) => (
                <Link key={audit.id} href={`/dashboard/audits/${audit.id}`}>
                  <span>
                    <strong>{audit.website.name}</strong>
                    <small>
                      {formatDate(audit.createdAt)} · {audit.type}
                    </small>
                  </span>
                  <span className="client-audit-score">
                    {scoreLabel(audit.overallScore)}
                  </span>
                  <em data-status={audit.status}>
                    {audit.status.replaceAll("_", " ")}
                  </em>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="client-detail-card client-reports-card">
          <div className="client-card-heading">
            <div>
              <p className="page-eyebrow">Deliverables</p>
              <h2>Reports</h2>
              <p>Generated reports associated with this client</p>
            </div>
          </div>
          {detail.reports.length === 0 ? (
            <div className="client-card-empty">
              <p>No reports have been generated for this client.</p>
            </div>
          ) : (
            <div className="client-report-list">
              {detail.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/dashboard/audits/${report.auditId}`}
                >
                  <span className="client-report-icon">PDF</span>
                  <span>
                    <strong>{report.title}</strong>
                    <small>
                      {report.websiteName} · {formatDate(report.createdAt)}
                    </small>
                  </span>
                  <em data-status={report.status}>{report.status}</em>
                  <b>Open audit →</b>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
