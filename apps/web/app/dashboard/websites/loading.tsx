export default function WebsitesLoading() {
  return (
    <div
      className="websites-page"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading websites…</span>
      <section className="websites-heading">
        <div>
          <div className="loading-line loading-eyebrow" />
          <div className="loading-line loading-title" />
          <div className="loading-line loading-copy" />
        </div>
      </section>
      <section className="website-panel website-loading-panel">
        <div className="loading-line loading-tabs" />
        {[0, 1, 2].map((item) => (
          <div className="website-loading-row" key={item}>
            <div className="loading-block" />
            <div>
              <div className="loading-line loading-name" />
              <div className="loading-line loading-url" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
