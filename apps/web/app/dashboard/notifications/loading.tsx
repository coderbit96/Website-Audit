export default function NotificationsLoading() {
  return (
    <div
      className="notifications-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading notifications…</span>
      <div className="notification-loading-title" />
      <div className="notification-loading-summary" />
      <div className="notification-loading-list">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
