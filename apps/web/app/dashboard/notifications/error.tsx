"use client";

export default function NotificationsError({ reset }: { reset: () => void }) {
  return (
    <div className="notifications-page">
      <section className="notification-route-error" role="alert">
        <span aria-hidden="true">!</span>
        <h1>Notifications are unavailable</h1>
        <p>
          We couldn’t load this inbox. Your notification records were not
          changed.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
