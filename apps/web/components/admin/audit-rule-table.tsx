type Rule = {
  code: string;
  name: string;
  category: string;
  severity: string;
  scoreWeight: number;
  enabled: boolean;
};

export function AuditRuleTable({ rules }: { rules: readonly Rule[] }) {
  return (
    <section className="admin-table-card">
      <header>
        <div>
          <p className="page-eyebrow">Runtime catalog</p>
          <h1>Audit rules</h1>
          <p>
            Deterministic rules loaded from the audit-rules package. This view
            is intentionally read-only.
          </p>
        </div>
        <span>{rules.length} rules</span>
      </header>
      <div
        className="admin-table-scroll"
        role="region"
        aria-label="Audit rules table"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Deterministic audit rule catalog
          </caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Default severity</th>
              <th scope="col">Weight</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.code}>
                <td>
                  <code>{rule.code}</code>
                </td>
                <td>{rule.name}</td>
                <td>{rule.category}</td>
                <td>{rule.severity}</td>
                <td>{rule.scoreWeight}</td>
                <td>{rule.enabled ? "Enabled" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
