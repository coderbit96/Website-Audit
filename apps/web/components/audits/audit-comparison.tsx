import Link from "next/link";

import type { AuditComparisonView } from "../../lib/audits/comparison";
import type { AuditComparisonSelection } from "../../lib/audits/comparison-validation";

type Comparison = NonNullable<AuditComparisonView["comparison"]>;
type ComparisonFinding =
  Comparison["findings"]["previews"][keyof Comparison["findings"]["previews"]][number];
type ScoreCategory = keyof Comparison["auditA"]["scores"];

const scoreMetrics = [
  ["OVERALL", "Overall"],
  ["SEO", "SEO"],
  ["TECHNICAL", "Technical"],
  ["PERFORMANCE", "Performance"],
  ["ACCESSIBILITY", "Accessibility"],
  ["SECURITY", "Security"],
  ["MOBILE", "Mobile"],
] as const satisfies ReadonlyArray<readonly [ScoreCategory, string]>;

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDelta(
  first: number | null,
  second: number | null,
): string | null {
  if (first === null || second === null) return null;
  const change = Math.round(second - first);
  return `${change > 0 ? "+" : ""}${change}`;
}

function deltaTone(
  first: number | null,
  second: number | null,
  higherIsBetter: boolean,
): "positive" | "negative" | "neutral" {
  if (first === null || second === null || first === second) return "neutral";
  const improved = higherIsBetter ? second > first : second < first;
  return improved ? "positive" : "negative";
}

function MetricCard({
  label,
  auditA,
  auditB,
  higherIsBetter = true,
}: {
  label: string;
  auditA: number | null;
  auditB: number | null;
  higherIsBetter?: boolean;
}) {
  const delta = formatDelta(auditA, auditB);
  return (
    <article className="audit-compare-metric">
      <span>{label}</span>
      <div>
        <p>
          <small>A</small>
          <strong>{auditA === null ? "N/A" : Math.round(auditA)}</strong>
        </p>
        <span aria-hidden="true">→</span>
        <p>
          <small>B</small>
          <strong>{auditB === null ? "N/A" : Math.round(auditB)}</strong>
        </p>
      </div>
      <em
        data-tone={deltaTone(auditA, auditB, higherIsBetter)}
        title="Audit B minus Audit A"
      >
        {delta ?? "Not comparable"}
      </em>
    </article>
  );
}

function AuditOptionLabel({
  audit,
}: {
  audit: AuditComparisonView["options"]["audits"][number];
}) {
  return (
    <>
      {formatDate(audit.completedAt)} · {titleCase(audit.type)}
    </>
  );
}

function AuditIdentity({
  label,
  audit,
}: {
  label: string;
  audit: Comparison["auditA"];
}) {
  return (
    <article className="audit-compare-identity">
      <div>
        <span>{label}</span>
        <strong>{formatDate(audit.completedAt)}</strong>
        <small>
          {titleCase(audit.type)} · {audit.pagesCrawled.toLocaleString("en-US")}{" "}
          pages
        </small>
      </div>
      <Link href={`/dashboard/audits/${audit.id}`}>Open report</Link>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  description,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "neutral" | "accent";
  description: string;
}) {
  return (
    <article className="audit-compare-summary-card" data-tone={tone}>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-US")}</strong>
      <p>{description}</p>
    </article>
  );
}

function FindingChange({
  finding,
  auditId,
}: {
  finding: ComparisonFinding;
  auditId: string;
}) {
  const severity = finding.currentSeverity ?? finding.previousSeverity;
  const occurrenceChanged =
    finding.previousOccurrences !== finding.currentOccurrences;
  return (
    <li className="audit-compare-finding">
      <div className="audit-compare-finding-heading">
        <span data-severity={severity}>
          {severity ? titleCase(severity) : "Issue"}
        </span>
        <code>{finding.ruleCode}</code>
      </div>
      <h4>{finding.title}</h4>
      <p title={finding.affectedUrl ?? undefined}>
        {finding.affectedUrl ?? "Site-wide finding"}
      </p>
      {finding.state === "REGRESSION" ? (
        <small>
          {finding.previousSeverity !== finding.currentSeverity
            ? `${titleCase(finding.previousSeverity ?? "unknown")} → ${titleCase(finding.currentSeverity ?? "unknown")}`
            : "Severity unchanged"}
          {occurrenceChanged
            ? ` · ${finding.previousOccurrences} → ${finding.currentOccurrences} occurrences`
            : ""}
        </small>
      ) : null}
      <Link
        href={`/dashboard/audits/${auditId}/issues?search=${encodeURIComponent(finding.ruleCode)}`}
      >
        Inspect finding
      </Link>
    </li>
  );
}

function FindingSection({
  title,
  description,
  findings,
  total,
  auditId,
  state,
}: {
  title: string;
  description: string;
  findings: readonly ComparisonFinding[];
  total: number;
  auditId: string;
  state: string;
}) {
  return (
    <article className="audit-compare-change-panel" data-state={state}>
      <header>
        <div>
          <span>{state}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{total.toLocaleString("en-US")}</strong>
      </header>
      {findings.length > 0 ? (
        <>
          <ul>
            {findings.map((finding) => (
              <FindingChange
                auditId={auditId}
                finding={finding}
                key={finding.identity}
              />
            ))}
          </ul>
          {total > findings.length ? (
            <p className="audit-compare-limit-note">
              Showing the first {findings.length} of {total} findings.
            </p>
          ) : null}
        </>
      ) : (
        <div className="audit-compare-panel-empty">
          No findings in this group.
        </div>
      )}
    </article>
  );
}

function PageChangeList({
  title,
  description,
  pages,
  tone,
}: {
  title: string;
  description: string;
  pages: Comparison["pages"]["added"];
  tone: "added" | "removed";
}) {
  const visiblePages = pages.slice(0, 40);
  return (
    <article className="audit-compare-pages-panel" data-tone={tone}>
      <header>
        <div>
          <span>{tone}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{pages.length.toLocaleString("en-US")}</strong>
      </header>
      {visiblePages.length > 0 ? (
        <>
          <ul>
            {visiblePages.map((page) => (
              <li key={page.normalizedUrl}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  title={page.url}
                  aria-label={`Open ${page.url} in a new tab`}
                >
                  {page.url}
                </a>
              </li>
            ))}
          </ul>
          {pages.length > visiblePages.length ? (
            <p className="audit-compare-limit-note">
              Showing the first {visiblePages.length} of {pages.length} pages.
            </p>
          ) : null}
        </>
      ) : (
        <div className="audit-compare-panel-empty">No {tone} pages.</div>
      )}
    </article>
  );
}

export function AuditComparison({
  result,
  selection,
}: {
  result: AuditComparisonView;
  selection: AuditComparisonSelection;
}) {
  const latestAudit = result.options.audits[0];
  const previousAudit = result.options.audits[1];
  const quickCompareQuery =
    selection.website && latestAudit && previousAudit
      ? new URLSearchParams({
          website: selection.website,
          auditA: previousAudit.id,
          auditB: latestAudit.id,
        }).toString()
      : null;
  const comparison = result.comparison;

  return (
    <div className="audit-compare-page">
      <section className="websites-heading audit-compare-heading">
        <div>
          <p className="page-eyebrow">Audit intelligence</p>
          <h1>Compare audits</h1>
          <p>
            Use one completed audit as the baseline and measure exactly what
            changed in a later—or earlier—run.
          </p>
        </div>
        <Link className="app-action-button" href="/dashboard/audits">
          Audit history
        </Link>
      </section>

      <section className="audit-compare-selector-card">
        <form action="/dashboard/compare" method="get">
          <label>
            <span>Website</span>
            <select
              name="website"
              defaultValue={selection.website ?? ""}
              required
            >
              <option value="">Choose a website</option>
              {result.options.websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Audit A · Baseline</span>
            <select
              name="auditA"
              defaultValue={selection.auditA ?? ""}
              disabled={!selection.website}
              required
            >
              <option value="">Choose baseline</option>
              {result.options.audits.map((audit) => (
                <option key={audit.id} value={audit.id}>
                  <AuditOptionLabel audit={audit} />
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Audit B · Comparison</span>
            <select
              name="auditB"
              defaultValue={selection.auditB ?? ""}
              disabled={!selection.website}
              required
            >
              <option value="">Choose comparison</option>
              {result.options.audits.map((audit) => (
                <option key={audit.id} value={audit.id}>
                  <AuditOptionLabel audit={audit} />
                </option>
              ))}
            </select>
          </label>
          <div className="audit-compare-selector-actions">
            <button type="submit">
              {selection.website ? "Compare audits" : "Load audits"}
            </button>
            <Link href="/dashboard/compare">Reset</Link>
          </div>
        </form>
        <div className="audit-compare-selector-note">
          <p>
            Only completed audits from the selected website can be compared.
            Audit A remains the baseline; every delta is Audit B minus Audit A.
          </p>
          {quickCompareQuery ? (
            <Link href={`/dashboard/compare?${quickCompareQuery}`}>
              Compare latest two audits
            </Link>
          ) : null}
        </div>
        {result.options.auditOptionsTruncated ? (
          <p className="audit-compare-warning">
            Showing the latest 200 of {result.options.auditTotal} completed
            audits.
          </p>
        ) : null}
      </section>

      {result.selectionError ? (
        <div className="audit-compare-selection-error" role="alert">
          {result.selectionError}
        </div>
      ) : null}

      {!comparison ? (
        <section className="audit-compare-empty">
          <span aria-hidden="true">⇄</span>
          <h2>
            {!selection.website
              ? "Choose a website"
              : result.options.auditTotal < 2
                ? "Two completed audits are required"
                : "Choose two audits"}
          </h2>
          <p>
            {!selection.website
              ? "Select a website to load its completed audit history."
              : result.options.auditTotal < 2
                ? "Run another audit for this website before creating a comparison."
                : "Select a baseline and comparison above, or use the latest-two shortcut."}
          </p>
        </section>
      ) : (
        <>
          <section className="audit-compare-context">
            <header>
              <div>
                <p className="page-eyebrow">Comparison</p>
                <h2>{comparison.website.name}</h2>
                <a
                  href={comparison.website.url}
                  target="_blank"
                  rel="noreferrer"
                  title={comparison.website.url}
                  aria-label={`Open ${comparison.website.url} in a new tab`}
                >
                  {comparison.website.url} ↗
                </a>
              </div>
              <small>
                Findings match on stable rule code and normalized affected URL.
              </small>
            </header>
            <div className="audit-compare-identities">
              <AuditIdentity
                label="Audit A · Baseline"
                audit={comparison.auditA}
              />
              <span aria-hidden="true">→</span>
              <AuditIdentity
                label="Audit B · Comparison"
                audit={comparison.auditB}
              />
            </div>
          </section>

          <section className="audit-compare-section">
            <header className="audit-compare-section-heading">
              <div>
                <p className="page-eyebrow">Scores</p>
                <h2>Health score movement</h2>
              </div>
              <span>Higher is better</span>
            </header>
            <div className="audit-compare-metric-grid">
              {scoreMetrics.map(([category, label]) => (
                <MetricCard
                  key={category}
                  label={label}
                  auditA={comparison.auditA.scores[category]}
                  auditB={comparison.auditB.scores[category]}
                />
              ))}
              <MetricCard
                label="Critical issues"
                auditA={comparison.auditA.criticalIssues}
                auditB={comparison.auditB.criticalIssues}
                higherIsBetter={false}
              />
              <MetricCard
                label="Warnings"
                auditA={comparison.auditA.warnings}
                auditB={comparison.auditB.warnings}
                higherIsBetter={false}
              />
            </div>
          </section>

          <section className="audit-compare-section">
            <header className="audit-compare-section-heading">
              <div>
                <p className="page-eyebrow">Change summary</p>
                <h2>What changed</h2>
              </div>
              <span>Finding groups are mutually exclusive</span>
            </header>
            <div className="audit-compare-summary-grid">
              <SummaryCard
                label="New issues"
                value={comparison.findings.counts.NEW}
                tone="negative"
                description="Present only in Audit B"
              />
              <SummaryCard
                label="Existing issues"
                value={comparison.findings.counts.EXISTING}
                tone="neutral"
                description="Present in both without worsening"
              />
              <SummaryCard
                label="Resolved issues"
                value={comparison.findings.counts.RESOLVED}
                tone="positive"
                description="Present in A and absent from B"
              />
              <SummaryCard
                label="Regressions"
                value={comparison.findings.counts.REGRESSION}
                tone="negative"
                description="Severity or occurrences increased"
              />
              <SummaryCard
                label="Pages added"
                value={comparison.pages.added.length}
                tone="accent"
                description="Normalized URLs found only in B"
              />
              <SummaryCard
                label="Pages removed"
                value={comparison.pages.removed.length}
                tone="neutral"
                description="Normalized URLs found only in A"
              />
            </div>
          </section>

          <section className="audit-compare-section">
            <header className="audit-compare-section-heading">
              <div>
                <p className="page-eyebrow">Issue lifecycle</p>
                <h2>Finding-level changes</h2>
              </div>
              <span>Passed checks are excluded from issue changes</span>
            </header>
            <div className="audit-compare-change-grid">
              <FindingSection
                title="New issues"
                description="Detected in Audit B but not in the baseline."
                findings={comparison.findings.previews.NEW}
                total={comparison.findings.counts.NEW}
                auditId={comparison.auditB.id}
                state="new"
              />
              <FindingSection
                title="Regressions"
                description="Persistent findings whose severity or occurrences increased."
                findings={comparison.findings.previews.REGRESSION}
                total={comparison.findings.counts.REGRESSION}
                auditId={comparison.auditB.id}
                state="regression"
              />
              <FindingSection
                title="Resolved issues"
                description="Detected in Audit A and absent from Audit B."
                findings={comparison.findings.previews.RESOLVED}
                total={comparison.findings.counts.RESOLVED}
                auditId={comparison.auditA.id}
                state="resolved"
              />
              <FindingSection
                title="Existing issues"
                description="Detected in both audits without a measured regression."
                findings={comparison.findings.previews.EXISTING}
                total={comparison.findings.counts.EXISTING}
                auditId={comparison.auditB.id}
                state="existing"
              />
            </div>
          </section>

          <section className="audit-compare-section">
            <header className="audit-compare-section-heading">
              <div>
                <p className="page-eyebrow">Crawl inventory</p>
                <h2>Page changes</h2>
              </div>
              <span>Matched by normalized crawl URL</span>
            </header>
            <div className="audit-compare-pages-grid">
              <PageChangeList
                title="Pages added"
                description="Crawled in Audit B but not Audit A."
                pages={comparison.pages.added}
                tone="added"
              />
              <PageChangeList
                title="Pages removed"
                description="Crawled in Audit A but not Audit B."
                pages={comparison.pages.removed}
                tone="removed"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
