import Link from "next/link";

export function ClientUpgradeState({ plan }: { plan: string }) {
  return (
    <div className="clients-page">
      <section className="clients-heading">
        <div>
          <p className="page-eyebrow">Agency workspace</p>
          <h1>Clients</h1>
          <p>Organize websites, audits, and reports by client.</p>
        </div>
      </section>
      <section className="client-upgrade-card">
        <span className="client-upgrade-mark" aria-hidden="true">
          A
        </span>
        <p className="page-eyebrow">Agency capability</p>
        <h2>Manage every client from one workspace</h2>
        <p>
          Your workspace is currently on the {plan} plan. Client records,
          website assignments, and client report history are included with the
          Agency plan.
        </p>
        <div className="client-upgrade-features">
          <span>Workspace-isolated records</span>
          <span>Website assignments</span>
          <span>Audit and report history</span>
        </div>
        <Link className="app-action-button" href="/dashboard/billing">
          View Agency plan
        </Link>
      </section>
    </div>
  );
}
