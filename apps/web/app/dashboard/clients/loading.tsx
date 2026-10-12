export default function ClientsLoading() {
  return (
    <div
      className="clients-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading clients…</span>
      <div className="client-loading-line client-loading-title" />
      <div className="client-loading-line client-loading-summary" />
      <div className="client-loading-panel">
        <div className="client-loading-line" />
        <div className="client-loading-line" />
        <div className="client-loading-line" />
      </div>
    </div>
  );
}
