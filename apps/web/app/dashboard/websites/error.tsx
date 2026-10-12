"use client";

export default function WebsitesError({ reset }: { reset: () => void }) {
  return (
    <div className="websites-page">
      <section className="website-page-error" role="alert">
        <span>!</span>
        <h1>Websites could not be loaded</h1>
        <p>
          The database request failed. Check the local MongoDB service and try
          again.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
