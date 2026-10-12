"use client";

import Link from "next/link";
import { useState } from "react";

import {
  NOTIFICATION_COUNT_EVENT,
  type NotificationCountEventDetail,
} from "../../lib/notifications/events";
import { getNotificationPresentation } from "../../lib/notifications/presentation";
import type {
  NotificationApiError,
  NotificationMutationResult,
  NotificationPageView,
  NotificationView,
} from "../../lib/notifications/types";

function formatNotificationDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function publishUnreadCount(count: number) {
  window.dispatchEvent(
    new CustomEvent<NotificationCountEventDetail>(NOTIFICATION_COUNT_EVENT, {
      detail: { count },
    }),
  );
}

async function readMutationResponse(
  response: Response,
): Promise<NotificationMutationResult> {
  const payload = (await response.json().catch(() => null)) as
    { data: NotificationMutationResult } | NotificationApiError | null;
  if (!response.ok || !payload || !("data" in payload)) {
    throw new Error(
      payload && "error" in payload
        ? payload.error
        : "The notification could not be updated.",
    );
  }
  return payload.data;
}

function pageHref(page: number): string {
  return page <= 1
    ? "/dashboard/notifications"
    : `/dashboard/notifications?page=${page}`;
}

export function NotificationCenter({
  initialPage,
}: {
  initialPage: NotificationPageView;
}) {
  const [notifications, setNotifications] = useState(initialPage.notifications);
  const [unreadCount, setUnreadCount] = useState(initialPage.unreadCount);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markRead(notification: NotificationView) {
    if (notification.readAt || pendingId) return;
    setPendingId(notification.id);
    setError(null);
    try {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
      const result = await readMutationResponse(response);
      if (result.notification) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === result.notification?.id ? result.notification : item,
          ),
        );
      }
      setUnreadCount(result.unreadCount);
      publishUnreadCount(result.unreadCount);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to mark the notification read.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      const result = await readMutationResponse(response);
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? readAt,
        })),
      );
      setUnreadCount(result.unreadCount);
      publishUnreadCount(result.unreadCount);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to mark notifications read.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="notifications-page">
      <section className="notifications-heading">
        <div>
          <p className="page-eyebrow">Activity inbox</p>
          <h1>Notifications</h1>
          <p>Important audit, report, workspace, and account updates.</p>
        </div>
        <button
          className="notification-mark-all"
          type="button"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0 || markingAll}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="m3 10 4 4 10-10M10 14l7-7" />
          </svg>
          {markingAll ? "Marking…" : "Mark all read"}
        </button>
      </section>

      <section
        className="notification-summary"
        aria-label="Notification summary"
      >
        <div>
          <span>Unread</span>
          <strong>{unreadCount}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{initialPage.total}</strong>
        </div>
        <p>
          Page {initialPage.page} of {initialPage.totalPages}
        </p>
      </section>

      {error ? (
        <div className="notification-error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="notification-panel">
        <header>
          <div>
            <h2>Recent activity</h2>
            <p>Newest notifications appear first.</p>
          </div>
          {unreadCount > 0 ? (
            <span>{unreadCount} unread</span>
          ) : (
            <span data-clear="true">All caught up</span>
          )}
        </header>

        {notifications.length === 0 ? (
          <div className="notification-empty-state">
            <span className="notification-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
              </svg>
            </span>
            <h2>You’re all caught up</h2>
            <p>
              Audit completions, score changes, reports, and workspace updates
              will appear here.
            </p>
            <Link href="/dashboard">Return to overview</Link>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const presentation = getNotificationPresentation(
                notification.type,
              );
              const unread = !notification.readAt;
              return (
                <article
                  className="notification-item"
                  data-unread={unread || undefined}
                  key={notification.id}
                >
                  <span
                    className="notification-type-icon"
                    data-tone={presentation.tone}
                    aria-hidden="true"
                  >
                    {presentation.shortLabel}
                  </span>
                  <div className="notification-copy">
                    <div>
                      <span>{presentation.label}</span>
                      {unread ? <em>New</em> : null}
                    </div>
                    <h3>{notification.title}</h3>
                    <p>{notification.message}</p>
                    <time dateTime={notification.createdAt}>
                      {formatNotificationDate(notification.createdAt)}
                    </time>
                  </div>
                  <div className="notification-actions">
                    {notification.href ? (
                      <Link href={notification.href}>View details</Link>
                    ) : null}
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => void markRead(notification)}
                        disabled={pendingId !== null}
                      >
                        {pendingId === notification.id
                          ? "Marking…"
                          : "Mark read"}
                      </button>
                    ) : (
                      <span>Read</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {initialPage.totalPages > 1 ? (
          <nav
            className="notification-pagination"
            aria-label="Notification pages"
          >
            {initialPage.page > 1 ? (
              <Link href={pageHref(initialPage.page - 1)}>← Previous</Link>
            ) : (
              <span aria-disabled="true">← Previous</span>
            )}
            <p>
              Showing {(initialPage.page - 1) * initialPage.pageSize + 1}–
              {Math.min(
                initialPage.page * initialPage.pageSize,
                initialPage.total,
              )}{" "}
              of {initialPage.total}
            </p>
            {initialPage.page < initialPage.totalPages ? (
              <Link href={pageHref(initialPage.page + 1)}>Next →</Link>
            ) : (
              <span aria-disabled="true">Next →</span>
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
