"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { useModalDialog } from "../../lib/accessibility/use-modal-dialog";
import type { ClientApiError, ClientView } from "../../lib/clients/types";
import {
  clientFieldsSchema,
  type ClientFieldsInput,
} from "../../lib/clients/validation";

type ClientFilter = "active" | "archived";
type PendingAction =
  | { type: "save"; id: string }
  | { type: "archive" | "restore"; id: string }
  | null;

class ClientRequestError extends Error {
  fieldErrors?: ClientApiError["fieldErrors"];

  constructor(message: string, fieldErrors?: ClientApiError["fieldErrors"]) {
    super(message);
    this.name = "ClientRequestError";
    if (fieldErrors) this.fieldErrors = fieldErrors;
  }
}

async function readClientResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    { data: T } | ClientApiError | null;
  if (!response.ok) {
    const error = payload && "error" in payload ? payload : null;
    throw new ClientRequestError(
      error?.error ?? "The request could not be completed.",
      error?.fieldErrors,
    );
  }
  if (!payload || !("data" in payload)) {
    throw new ClientRequestError("The server returned an unexpected response.");
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function ClientIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 21v-9h16v9M7 12V5h10v7M9 8h2m2 0h2M8 16h3m2 0h3" />
    </svg>
  );
}

function closeActionMenu(trigger: HTMLElement): void {
  const menu = trigger.closest("details");
  menu?.removeAttribute("open");
  menu?.querySelector<HTMLElement>("summary")?.focus();
}

const emptyFields: ClientFieldsInput = {
  companyName: "",
  contactName: undefined,
  email: undefined,
  phone: undefined,
  notes: undefined,
};

export function ClientManager({
  initialClients,
  canManage,
  clientLimit,
}: {
  initialClients: ClientView[];
  canManage: boolean;
  clientLimit: number;
}) {
  const [clients, setClients] = useState(initialClients);
  const [filter, setFilter] = useState<ClientFilter>("active");
  const [dialogClient, setDialogClient] = useState<ClientView | "new" | null>(
    null,
  );
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const form = useForm<ClientFieldsInput>({
    resolver: zodResolver(clientFieldsSchema),
    defaultValues: emptyFields,
  });

  const visibleClients = useMemo(
    () =>
      clients.filter((client) =>
        filter === "active" ? client.isActive : !client.isActive,
      ),
    [clients, filter],
  );
  const activeCount = clients.filter((client) => client.isActive).length;
  const archivedCount = clients.length - activeCount;

  function openCreate() {
    form.reset(emptyFields);
    setDialogClient("new");
  }

  function openEdit(client: ClientView) {
    form.reset({
      companyName: client.companyName,
      contactName: client.contactName ?? undefined,
      email: client.email ?? undefined,
      phone: client.phone ?? undefined,
      notes: client.notes ?? undefined,
    });
    setDialogClient(client);
  }

  function closeDialog() {
    if (pending?.type === "save") return;
    setDialogClient(null);
    form.clearErrors();
  }

  useModalDialog({
    isOpen: dialogClient !== null,
    onClose: closeDialog,
    dialogRef,
  });

  function setFieldErrors(error: ClientRequestError) {
    const fieldNames = [
      "companyName",
      "contactName",
      "email",
      "phone",
      "notes",
    ] as const;
    let hasFieldError = false;
    for (const name of fieldNames) {
      const message = error.fieldErrors?.[name]?.[0];
      if (message) {
        form.setError(name, { message });
        hasFieldError = true;
      }
    }
    if (!hasFieldError) form.setError("root", { message: error.message });
  }

  async function saveClient(fields: ClientFieldsInput) {
    if (!dialogClient) return;
    const creating = dialogClient === "new";
    const id = creating ? "new" : dialogClient.id;
    setPending({ type: "save", id });
    setNotice(null);
    try {
      const response = await fetch(
        creating ? "/api/clients" : `/api/clients/${dialogClient.id}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            creating ? fields : { operation: "update", ...fields },
          ),
        },
      );
      const client = await readClientResponse<ClientView>(response);
      setClients((current) =>
        creating
          ? [client, ...current]
          : current.map((item) => (item.id === client.id ? client : item)),
      );
      setFilter("active");
      setDialogClient(null);
      setNotice({
        type: "success",
        message: creating
          ? `${client.companyName} was added.`
          : `${client.companyName} was updated.`,
      });
    } catch (error) {
      if (error instanceof ClientRequestError) setFieldErrors(error);
      else form.setError("root", { message: "Unable to save this client." });
    } finally {
      setPending(null);
    }
  }

  async function changeArchiveState(client: ClientView) {
    const operation = client.isActive ? "archive" : "restore";
    setPending({ type: operation, id: client.id });
    setNotice(null);
    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation }),
      });
      const updated = await readClientResponse<ClientView>(response);
      setClients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice({
        type: "success",
        message: `${updated.companyName} was ${operation === "archive" ? "archived" : "restored"}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Unable to ${operation} this client.`,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="clients-page">
      <section className="clients-heading">
        <div>
          <p className="page-eyebrow">Agency workspace</p>
          <h1>Clients</h1>
          <p>
            Keep every client, website, audit, and report in the right place.
          </p>
        </div>
        {canManage ? (
          <button
            className="app-action-button"
            type="button"
            onClick={openCreate}
            disabled={activeCount >= clientLimit}
          >
            <PlusIcon /> Add client
          </button>
        ) : null}
      </section>

      <section className="client-summary-strip" aria-label="Client summary">
        <div>
          <span>Active clients</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Available capacity</span>
          <strong>{Math.max(0, clientLimit - activeCount)}</strong>
        </div>
        <p>
          {activeCount} of {clientLimit} Agency client spaces in use
        </p>
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

      <section className="client-panel">
        <div className="client-toolbar">
          <div className="client-tabs" role="group" aria-label="Client status">
            <button
              type="button"
              aria-pressed={filter === "active"}
              aria-controls="client-filter-results"
              onClick={() => setFilter("active")}
            >
              Active <span>{activeCount}</span>
            </button>
            <button
              type="button"
              aria-pressed={filter === "archived"}
              aria-controls="client-filter-results"
              onClick={() => setFilter("archived")}
            >
              Archived <span>{archivedCount}</span>
            </button>
          </div>
          <p aria-live="polite">
            {visibleClients.length}{" "}
            {visibleClients.length === 1 ? "client" : "clients"}
          </p>
        </div>

        <div id="client-filter-results">
          {visibleClients.length === 0 ? (
            <div className="client-empty-state">
              <span>
                <ClientIcon />
              </span>
              <h2>
                {filter === "active"
                  ? "Add your first client"
                  : "No archived clients"}
              </h2>
              <p>
                {filter === "active"
                  ? "Create a client record, then connect the websites you manage for them."
                  : "Archived client records remain available here with their history intact."}
              </p>
              {filter === "active" && canManage ? (
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={activeCount >= clientLimit}
                >
                  <PlusIcon /> Add client
                </button>
              ) : null}
            </div>
          ) : (
            <div className="client-list">
              <div className="client-list-header" aria-hidden="true">
                <span>Client</span>
                <span>Contact</span>
                <span>Websites</span>
                <span>Added</span>
                <span />
              </div>
              {visibleClients.map((client) => {
                const isPending = pending?.id === client.id;
                return (
                  <article className="client-row" key={client.id}>
                    <div className="client-identity">
                      <span className="client-avatar">
                        {client.companyName.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <Link href={`/dashboard/clients/${client.id}`}>
                          {client.companyName}
                        </Link>
                        <span data-active={client.isActive}>
                          {client.isActive ? "Active" : "Archived"}
                        </span>
                      </div>
                    </div>
                    <div className="client-contact-cell">
                      <strong>{client.contactName ?? "No contact set"}</strong>
                      <span>
                        {client.email ??
                          client.phone ??
                          "Contact details not added"}
                      </span>
                    </div>
                    <div className="client-stat-cell">
                      <strong>{client.websiteCount}</strong>
                      <span>
                        {client.websiteCount === 1 ? "website" : "websites"}
                      </span>
                    </div>
                    <div className="client-stat-cell">
                      <strong>{formatDate(client.createdAt)}</strong>
                      <span>Created</span>
                    </div>
                    <div className="client-row-actions">
                      <Link href={`/dashboard/clients/${client.id}`}>Open</Link>
                      {canManage ? (
                        <details>
                          <summary aria-label={`Manage ${client.companyName}`}>
                            •••
                          </summary>
                          <div>
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                openEdit(client);
                              }}
                              disabled={isPending}
                            >
                              Edit details
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                void changeArchiveState(client);
                              }}
                              disabled={isPending}
                            >
                              {client.isActive
                                ? "Archive client"
                                : "Restore client"}
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
        <p className="client-permission-note">
          You have read-only access. A workspace owner or admin can manage
          clients.
        </p>
      ) : null}

      {dialogClient ? (
        <div
          className="app-dialog-layer"
          role="presentation"
          onMouseDown={closeDialog}
        >
          <section
            ref={dialogRef}
            className="app-dialog client-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-dialog-title"
            aria-describedby="client-dialog-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-dialog-heading">
              <div>
                <p className="page-eyebrow">
                  {dialogClient === "new"
                    ? "New relationship"
                    : "Client details"}
                </p>
                <h2 id="client-dialog-title">
                  {dialogClient === "new" ? "Add a client" : "Edit client"}
                </h2>
                <p id="client-dialog-description">
                  Keep the essential contact details your team needs.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>
            <form
              className="client-form"
              onSubmit={form.handleSubmit(saveClient)}
              noValidate
              aria-busy={pending?.type === "save"}
            >
              {form.formState.errors.root?.message ? (
                <p className="form-alert" role="alert">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <div className="field-group client-field-wide">
                <label htmlFor="client-company">Company name</label>
                <input
                  id="client-company"
                  data-dialog-initial-focus
                  placeholder="North Star Studio"
                  aria-invalid={Boolean(form.formState.errors.companyName)}
                  aria-describedby={
                    form.formState.errors.companyName
                      ? "client-company-error"
                      : undefined
                  }
                  {...form.register("companyName")}
                />
                {form.formState.errors.companyName?.message ? (
                  <p
                    className="field-error"
                    id="client-company-error"
                    role="alert"
                  >
                    {form.formState.errors.companyName.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group">
                <label htmlFor="client-contact">Contact name</label>
                <input
                  id="client-contact"
                  placeholder="Alex Morgan"
                  aria-invalid={Boolean(form.formState.errors.contactName)}
                  aria-describedby={
                    form.formState.errors.contactName
                      ? "client-contact-error"
                      : undefined
                  }
                  {...form.register("contactName")}
                />
                {form.formState.errors.contactName?.message ? (
                  <p
                    className="field-error"
                    id="client-contact-error"
                    role="alert"
                  >
                    {form.formState.errors.contactName.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group">
                <label htmlFor="client-email">Email</label>
                <input
                  id="client-email"
                  type="email"
                  placeholder="alex@northstar.com"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  aria-describedby={
                    form.formState.errors.email
                      ? "client-email-error"
                      : undefined
                  }
                  {...form.register("email")}
                />
                {form.formState.errors.email?.message ? (
                  <p
                    className="field-error"
                    id="client-email-error"
                    role="alert"
                  >
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group client-field-wide">
                <label htmlFor="client-phone">Phone</label>
                <input
                  id="client-phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  aria-invalid={Boolean(form.formState.errors.phone)}
                  aria-describedby={
                    form.formState.errors.phone
                      ? "client-phone-error"
                      : undefined
                  }
                  {...form.register("phone")}
                />
                {form.formState.errors.phone?.message ? (
                  <p
                    className="field-error"
                    id="client-phone-error"
                    role="alert"
                  >
                    {form.formState.errors.phone.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group client-field-wide">
                <label htmlFor="client-notes">Notes</label>
                <textarea
                  id="client-notes"
                  rows={4}
                  placeholder="Relationship context, preferences, and internal notes…"
                  aria-invalid={Boolean(form.formState.errors.notes)}
                  aria-describedby={
                    form.formState.errors.notes
                      ? "client-notes-error"
                      : "client-notes-hint"
                  }
                  {...form.register("notes")}
                />
                <p className="field-hint" id="client-notes-hint">
                  Private to this workspace.
                </p>
                {form.formState.errors.notes?.message ? (
                  <p
                    className="field-error"
                    id="client-notes-error"
                    role="alert"
                  >
                    {form.formState.errors.notes.message}
                  </p>
                ) : null}
              </div>
              <div className="app-dialog-actions client-field-wide">
                <button
                  className="dialog-secondary-button"
                  type="button"
                  onClick={closeDialog}
                  disabled={pending?.type === "save"}
                >
                  Cancel
                </button>
                <button
                  className="dialog-primary-button"
                  type="submit"
                  disabled={pending?.type === "save"}
                >
                  {pending?.type === "save"
                    ? "Saving…"
                    : dialogClient === "new"
                      ? "Add client"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
