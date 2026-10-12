"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import type {
  WebsiteApiError,
  WebsiteApiSuccess,
  WebsiteView,
} from "../../lib/websites/types";
import {
  createWebsiteSchema,
  type CreateWebsiteInput,
  websiteNameSchema,
} from "../../lib/websites/validation";
import { useModalDialog } from "../../lib/accessibility/use-modal-dialog";
import { StartAuditButton } from "../audits/start-audit-button";

type WebsiteFilter = "active" | "archived";
type PendingAction =
  | { id: string; type: "archive" | "restore" | "delete" | "rename" }
  | { id: "new"; type: "create" }
  | null;

class ApiRequestError extends Error {
  fieldErrors?: WebsiteApiError["fieldErrors"];

  constructor(message: string, fieldErrors?: WebsiteApiError["fieldErrors"]) {
    super(message);
    this.name = "ApiRequestError";
    if (fieldErrors) {
      this.fieldErrors = fieldErrors;
    }
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    WebsiteApiSuccess<T> | WebsiteApiError | null;

  if (!response.ok) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new ApiRequestError(
      errorPayload?.error ?? "The request could not be completed.",
      errorPayload?.fieldErrors,
    );
  }

  if (!payload || !("data" in payload)) {
    throw new ApiRequestError("The server returned an unexpected response.");
  }

  return payload.data;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function WebsiteGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3c2 2.2 3 5.2 3 9s-1 6.8-3 9c-2-2.2-3-5.2-3-9s1-6.8 3-9Z" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function MoreGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="4" cy="10" r="1" />
      <circle cx="10" cy="10" r="1" />
      <circle cx="16" cy="10" r="1" />
    </svg>
  );
}

function closeActionMenu(trigger: HTMLElement): void {
  const menu = trigger.closest("details");
  menu?.removeAttribute("open");
  menu?.querySelector<HTMLElement>("summary")?.focus();
}

export function WebsiteManager({
  initialWebsites,
  canManage,
}: {
  initialWebsites: WebsiteView[];
  canManage: boolean;
}) {
  const [websites, setWebsites] = useState(initialWebsites);
  const [filter, setFilter] = useState<WebsiteFilter>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WebsiteView | null>(null);
  const [deleting, setDeleting] = useState<WebsiteView | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const createDialogRef = useRef<HTMLElement>(null);
  const editDialogRef = useRef<HTMLElement>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);

  const form = useForm<CreateWebsiteInput>({
    resolver: zodResolver(createWebsiteSchema),
    defaultValues: { name: "", url: "" },
  });

  const visibleWebsites = useMemo(
    () =>
      websites.filter((website) =>
        filter === "active" ? website.isActive : !website.isActive,
      ),
    [filter, websites],
  );
  const activeCount = websites.filter((website) => website.isActive).length;
  const archivedCount = websites.length - activeCount;

  function updateWebsite(updated: WebsiteView) {
    setWebsites((current) =>
      current.map((website) => (website.id === updated.id ? updated : website)),
    );
  }

  function closeCreateDialog() {
    if (pending?.type === "create") return;
    setShowCreate(false);
    form.reset();
    form.clearErrors();
  }

  function closeEditDialog() {
    if (pending?.type === "rename") return;
    setEditing(null);
  }

  function closeDeleteDialog() {
    if (pending?.type === "delete") return;
    setDeleting(null);
  }

  useModalDialog({
    isOpen: showCreate,
    onClose: closeCreateDialog,
    dialogRef: createDialogRef,
  });
  useModalDialog({
    isOpen: editing !== null,
    onClose: closeEditDialog,
    dialogRef: editDialogRef,
  });
  useModalDialog({
    isOpen: deleting !== null,
    onClose: closeDeleteDialog,
    dialogRef: deleteDialogRef,
  });

  async function createWebsite(input: CreateWebsiteInput) {
    setPending({ id: "new", type: "create" });
    setNotice(null);

    try {
      const response = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const website = await readApiResponse<WebsiteView>(response);
      setWebsites((current) => [website, ...current]);
      setFilter("active");
      setShowCreate(false);
      form.reset();
      setNotice({
        type: "success",
        message: `${website.name} was added successfully.`,
      });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const nameError = error.fieldErrors?.name?.[0];
        const urlError = error.fieldErrors?.url?.[0];
        if (nameError) form.setError("name", { message: nameError });
        if (urlError) form.setError("url", { message: urlError });
        if (!nameError && !urlError) {
          form.setError("root", { message: error.message });
        }
      } else {
        form.setError("root", { message: "Unable to add the website." });
      }
    } finally {
      setPending(null);
    }
  }

  function openEditDialog(website: WebsiteView) {
    setEditing(website);
    setEditName(website.name);
    setEditError(null);
  }

  async function renameWebsite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const validation = websiteNameSchema.safeParse(editName);
    if (!validation.success) {
      setEditError(
        validation.error.issues[0]?.message ?? "Enter a valid name.",
      );
      return;
    }

    setPending({ id: editing.id, type: "rename" });
    setEditError(null);

    try {
      const response = await fetch(`/api/websites/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: validation.data }),
      });
      const updated = await readApiResponse<WebsiteView>(response);
      updateWebsite(updated);
      setEditing(null);
      setNotice({
        type: "success",
        message: "Website name updated successfully.",
      });
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Unable to update the website.",
      );
    } finally {
      setPending(null);
    }
  }

  async function changeArchiveState(website: WebsiteView) {
    const action = website.isActive ? "archive" : "restore";
    setPending({ id: website.id, type: action });
    setNotice(null);

    try {
      const response = await fetch(`/api/websites/${website.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const updated = await readApiResponse<WebsiteView>(response);
      updateWebsite(updated);
      setNotice({
        type: "success",
        message: `${updated.name} was ${action === "archive" ? "archived" : "restored"}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Unable to ${action} the website.`,
      });
    } finally {
      setPending(null);
    }
  }

  async function deleteWebsite() {
    if (!deleting) return;
    setPending({ id: deleting.id, type: "delete" });
    setNotice(null);

    try {
      const response = await fetch(`/api/websites/${deleting.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as WebsiteApiError | null;
        throw new ApiRequestError(
          payload?.error ?? "Unable to delete the website.",
        );
      }

      const deletedName = deleting.name;
      setWebsites((current) =>
        current.filter((website) => website.id !== deleting.id),
      );
      setDeleting(null);
      setNotice({
        type: "success",
        message: `${deletedName} was permanently deleted.`,
      });
    } catch (error) {
      setDeleting(null);
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete the website.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="websites-page">
      <section className="websites-heading">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1>Websites</h1>
          <p>Manage the websites available for audits in this workspace.</p>
        </div>
        {canManage ? (
          <button
            className="app-action-button"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            <PlusGlyph />
            Add website
          </button>
        ) : null}
      </section>

      {notice ? (
        <div
          className="website-notice"
          data-type={notice.type}
          role={notice.type === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true">
            {notice.type === "success" ? "✓" : "!"}
          </span>
          <p>{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="website-panel">
        <div className="website-toolbar">
          <div
            className="website-tabs"
            role="group"
            aria-label="Website status"
          >
            <button
              type="button"
              aria-pressed={filter === "active"}
              aria-controls="website-filter-results"
              onClick={() => setFilter("active")}
            >
              Active <span>{activeCount}</span>
            </button>
            <button
              type="button"
              aria-pressed={filter === "archived"}
              aria-controls="website-filter-results"
              onClick={() => setFilter("archived")}
            >
              Archived <span>{archivedCount}</span>
            </button>
          </div>
          <p aria-live="polite">
            {visibleWebsites.length}{" "}
            {visibleWebsites.length === 1 ? "website" : "websites"}
          </p>
        </div>

        <div id="website-filter-results">
          {visibleWebsites.length === 0 ? (
            <div className="website-empty-state">
              <div className="website-empty-icon">
                <WebsiteGlyph />
              </div>
              <h2>
                {filter === "active"
                  ? "Add your first website"
                  : "No archived websites"}
              </h2>
              <p>
                {filter === "active"
                  ? "Connect a public website now so it is ready when audit processing is enabled."
                  : "Websites you archive will remain safely available here."}
              </p>
              {filter === "active" && canManage ? (
                <button type="button" onClick={() => setShowCreate(true)}>
                  <PlusGlyph /> Add website
                </button>
              ) : null}
            </div>
          ) : (
            <div className="website-list">
              {visibleWebsites.map((website) => {
                const isPending = pending?.id === website.id;

                return (
                  <article className="website-row" key={website.id}>
                    <div className="website-identity">
                      <span className="website-favicon">
                        <WebsiteGlyph />
                      </span>
                      <div>
                        <div className="website-name-line">
                          <Link href={`/dashboard/websites/${website.id}`}>
                            {website.name}
                          </Link>
                          <span data-active={website.isActive}>
                            {website.isActive ? "Active" : "Archived"}
                          </span>
                        </div>
                        <a
                          href={website.url}
                          target="_blank"
                          rel="noreferrer"
                          title={website.url}
                          aria-label={`Open ${website.url} in a new tab`}
                        >
                          {website.url}
                          <span aria-hidden="true">↗</span>
                        </a>
                      </div>
                    </div>

                    <div className="website-meta">
                      <span>Added</span>
                      <strong>{formatDate(website.createdAt)}</strong>
                    </div>
                    <div className="website-meta">
                      <span>Last audit</span>
                      <strong>
                        {website.lastAuditedAt
                          ? formatDate(website.lastAuditedAt)
                          : "Not audited"}
                      </strong>
                    </div>

                    <div className="website-row-actions">
                      <StartAuditButton
                        websiteId={website.id}
                        disabled={!website.isActive || !canManage}
                      />
                      <Link
                        className="website-view-link"
                        href={`/dashboard/websites/${website.id}`}
                      >
                        View
                      </Link>
                      {canManage ? (
                        <details className="website-actions-menu">
                          <summary aria-label={`Manage ${website.name}`}>
                            <MoreGlyph />
                          </summary>
                          <div>
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                openEditDialog(website);
                              }}
                              disabled={isPending}
                            >
                              Edit name
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                void changeArchiveState(website);
                              }}
                              disabled={isPending}
                            >
                              {website.isActive ? "Archive" : "Restore"}
                            </button>
                            <button
                              className="danger-action"
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                setDeleting(website);
                              }}
                              disabled={isPending}
                            >
                              Delete permanently
                            </button>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {!canManage ? (
        <p className="website-permission-note">
          You have read-only access. Ask a workspace owner or admin to manage
          websites.
        </p>
      ) : null}

      {showCreate ? (
        <div
          className="app-dialog-layer"
          role="presentation"
          onMouseDown={closeCreateDialog}
        >
          <section
            ref={createDialogRef}
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-website-title"
            aria-describedby="add-website-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-dialog-heading">
              <div>
                <p className="page-eyebrow">New website</p>
                <h2 id="add-website-title">Add a website</h2>
                <p id="add-website-description">
                  Enter the public homepage you want to audit later.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateDialog}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form
              className="website-form"
              onSubmit={form.handleSubmit(createWebsite)}
              noValidate
              aria-busy={pending?.type === "create"}
            >
              {form.formState.errors.root?.message ? (
                <p className="form-alert" role="alert">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <div className="field-group">
                <label htmlFor="website-name">Website name</label>
                <input
                  id="website-name"
                  placeholder="Acme marketing site"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  aria-describedby={
                    form.formState.errors.name
                      ? "website-name-error"
                      : undefined
                  }
                  data-dialog-initial-focus
                  {...form.register("name")}
                />
                {form.formState.errors.name?.message ? (
                  <p
                    className="field-error"
                    id="website-name-error"
                    role="alert"
                  >
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group">
                <label htmlFor="website-url">Website URL</label>
                <input
                  id="website-url"
                  placeholder="example.com"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(form.formState.errors.url)}
                  aria-describedby={
                    form.formState.errors.url
                      ? "website-url-error"
                      : "website-url-hint"
                  }
                  {...form.register("url")}
                />
                {form.formState.errors.url?.message ? (
                  <p
                    className="field-error"
                    id="website-url-error"
                    role="alert"
                  >
                    {form.formState.errors.url.message}
                  </p>
                ) : (
                  <p className="field-hint" id="website-url-hint">
                    Use the homepage only. HTTPS is added when no protocol is
                    provided.
                  </p>
                )}
              </div>
              <div className="app-dialog-actions">
                <button
                  className="dialog-secondary-button"
                  type="button"
                  onClick={closeCreateDialog}
                  disabled={pending?.type === "create"}
                >
                  Cancel
                </button>
                <button
                  className="dialog-primary-button"
                  type="submit"
                  disabled={pending?.type === "create"}
                >
                  {pending?.type === "create" ? "Adding…" : "Add website"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editing ? (
        <div
          className="app-dialog-layer"
          role="presentation"
          onMouseDown={closeEditDialog}
        >
          <section
            ref={editDialogRef}
            className="app-dialog app-dialog-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-website-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-dialog-heading">
              <div>
                <p className="page-eyebrow">Website details</p>
                <h2 id="edit-website-title">Edit website name</h2>
              </div>
              <button
                type="button"
                onClick={closeEditDialog}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form
              className="website-form"
              onSubmit={renameWebsite}
              noValidate
              aria-busy={pending?.type === "rename"}
            >
              <div className="field-group">
                <label htmlFor="edit-website-name">Website name</label>
                <input
                  id="edit-website-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  aria-invalid={Boolean(editError)}
                  aria-describedby={
                    editError ? "edit-website-error" : undefined
                  }
                  data-dialog-initial-focus
                />
                {editError ? (
                  <p
                    className="field-error"
                    id="edit-website-error"
                    role="alert"
                  >
                    {editError}
                  </p>
                ) : null}
              </div>
              <div className="app-dialog-actions">
                <button
                  className="dialog-secondary-button"
                  type="button"
                  onClick={closeEditDialog}
                  disabled={pending?.type === "rename"}
                >
                  Cancel
                </button>
                <button
                  className="dialog-primary-button"
                  type="submit"
                  disabled={pending?.type === "rename"}
                >
                  {pending?.type === "rename" ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleting ? (
        <div
          className="app-dialog-layer"
          role="presentation"
          onMouseDown={closeDeleteDialog}
        >
          <section
            ref={deleteDialogRef}
            className="app-dialog app-dialog-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-website-title"
            aria-describedby="delete-website-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="delete-dialog-icon">!</div>
            <h2 id="delete-website-title">Delete {deleting.name}?</h2>
            <p id="delete-website-description">
              This permanently removes the website. It cannot be undone.
              Websites with audit history or schedules must be archived instead.
            </p>
            <div className="app-dialog-actions">
              <button
                className="dialog-secondary-button"
                type="button"
                onClick={closeDeleteDialog}
                disabled={pending?.type === "delete"}
              >
                Cancel
              </button>
              <button
                className="dialog-danger-button"
                type="button"
                onClick={() => void deleteWebsite()}
                disabled={pending?.type === "delete"}
              >
                {pending?.type === "delete"
                  ? "Deleting…"
                  : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
