export default function LeadsLoading() {
  return (
    <div
      className="lead-admin-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading leads…</span>
      <section className="lead-admin-heading">
        <div>
          <p className="page-eyebrow">Super Admin</p>
          <h1>Lead inbox</h1>
          <p>Loading private service requests…</p>
        </div>
      </section>
      <div className="lead-admin-loading" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
