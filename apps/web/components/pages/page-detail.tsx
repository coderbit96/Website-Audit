import Link from "next/link";

import type { PageDetailView } from "../../lib/pages/service";

type PageFinding = PageDetailView["findings"][number];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatEvidence(value: unknown): string {
  if (value === null || value === undefined) return "No evidence was recorded.";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function statusTone(statusCode: number | null): string {
  if (statusCode === null || statusCode >= 400) return "error";
  if (statusCode >= 300) return "redirect";
  return "success";
}

function Value({ value }: { value: string | number | null }) {
  return <>{value === null || value === "" ? "N/A" : value}</>;
}

function FullValue({ value }: { value: string | null }) {
  if (!value) return <>N/A</>;
  return (
    <span className="full-value" title={value}>
      {value}
    </span>
  );
}

function FindingCard({
  finding,
  auditId,
  affectedUrl,
}: {
  finding: PageFinding;
  auditId: string;
  affectedUrl: string;
}) {
  const issueQuery = new URLSearchParams({
    category: finding.category,
    affectedPage: affectedUrl,
  });
  return (
    <article className="page-finding-card">
      <div className="page-finding-heading">
        <div>
          <span data-severity={finding.severity}>{finding.severity}</span>
          <span data-status={finding.status}>{finding.status}</span>
          <span>{finding.category}</span>
        </div>
        <code>{finding.ruleCode}</code>
      </div>
      <h3>{finding.title}</h3>
      <p>{finding.description}</p>
      <dl>
        <div>
          <dt>Score impact</dt>
          <dd>{finding.scoreImpact}</dd>
        </div>
        <div>
          <dt>Occurrences</dt>
          <dd>{finding.occurrences}</dd>
        </div>
      </dl>
      <details>
        <summary>Detected evidence</summary>
        <pre tabIndex={0} aria-label="Detected evidence">
          {formatEvidence(finding.evidence)}
        </pre>
      </details>
      <details>
        <summary>Recommended solution</summary>
        <p>{finding.recommendation}</p>
      </details>
      <Link
        href={`/dashboard/audits/${auditId}/issues?${issueQuery.toString()}`}
      >
        Open related issues →
      </Link>
    </article>
  );
}

export function PageDetail({ detail }: { detail: PageDetailView }) {
  const page = detail.page;
  const indexability =
    page.indexable === null
      ? "N/A"
      : page.indexable
        ? "Indexable"
        : "Not indexable";
  const headingMetrics = [
    ["All headings", page.headingCount],
    ["H1", page.h1Count],
    ["H2", page.h2Count],
    ["H3", page.h3Count],
    ["H4", page.h4Count],
    ["H5", page.h5Count],
    ["H6", page.h6Count],
  ] as const;
  const resourceMetrics = [
    ["Images", page.imageCount],
    ["Missing alt", page.imagesMissingAlt],
    ["Internal links", page.internalLinkCount],
    ["External links", page.externalLinkCount],
    ["Structured data", page.structuredDataCount],
    ["Invalid structured data", page.invalidStructuredDataCount],
    ["Forms", page.formCount],
    ["Form controls", page.formControlCount],
    ["Labeled controls", page.labeledFormControlCount],
    ["Labels", page.labelCount],
    ["Buttons", page.buttonCount],
    ["Scripts", page.scriptCount],
    ["Stylesheets", page.stylesheetCount],
    ["Iframes", page.iframeCount],
    ["Mixed-content resources", page.mixedContentResourceCount],
  ] as const;

  return (
    <div className="page-detail-page">
      <Link
        className="website-back-link"
        href={`/dashboard/audits/${detail.audit.id}/pages`}
      >
        ← Back to pages
      </Link>

      <header className="page-detail-heading">
        <div>
          <p className="page-eyebrow">Crawled page</p>
          <h1>{page.title ?? "Untitled page"}</h1>
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            title={page.url}
            aria-label={`Open ${page.url} in a new tab`}
          >
            {page.url} ↗
          </a>
        </div>
        <Link href={`/dashboard/audits/${detail.audit.id}`}>Audit report</Link>
      </header>

      {page.errorMessage || page.fetchErrorCode ? (
        <div className="page-fetch-error" role="status">
          <strong>Fetch issue</strong>
          <span>
            {page.errorMessage ?? page.fetchErrorCode ?? "Unknown fetch error"}
          </span>
        </div>
      ) : null}

      <section className="page-detail-summary" aria-label="Page crawl summary">
        <article>
          <span>Status code</span>
          <strong data-status={statusTone(page.statusCode)}>
            {page.statusCode ?? "Error"}
          </strong>
        </article>
        <article>
          <span>Indexability</span>
          <strong>{indexability}</strong>
        </article>
        <article>
          <span>Depth</span>
          <strong>{page.depth}</strong>
        </article>
        <article>
          <span>Response time</span>
          <strong>
            {page.responseTimeMs === null ? "N/A" : `${page.responseTimeMs} ms`}
          </strong>
        </article>
        <article>
          <span>Page size</span>
          <strong>{formatBytes(page.pageSizeBytes)}</strong>
        </article>
        <article>
          <span>Discovered via</span>
          <strong>{page.discoveredVia ?? "N/A"}</strong>
        </article>
      </section>

      {page.metadataTruncatedFields.length > 0 ? (
        <div className="page-metadata-note">
          Large extracted collections were safely capped for:{" "}
          {page.metadataTruncatedFields.join(", ")}.
        </div>
      ) : null}

      <div className="page-detail-grid">
        <section className="page-detail-card page-detail-card-wide">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Search metadata</p>
            <h2>SEO essentials</h2>
          </div>
          <dl className="page-definition-list">
            <div>
              <dt>Title</dt>
              <dd>
                <Value value={page.title} />
              </dd>
            </div>
            <div>
              <dt>Meta description</dt>
              <dd>
                <Value value={page.metaDescription} />
              </dd>
            </div>
            <div>
              <dt>Canonical URL</dt>
              <dd>
                <FullValue value={page.canonicalUrl} />
              </dd>
            </div>
            <div>
              <dt>Canonical declarations</dt>
              <dd
                title={
                  page.canonicalDeclarations.length > 0
                    ? page.canonicalDeclarations.join(", ")
                    : undefined
                }
              >
                {page.canonicalDeclarations.length > 0
                  ? page.canonicalDeclarations.join(", ")
                  : "None"}
              </dd>
            </div>
            <div>
              <dt>HTML language</dt>
              <dd>
                <Value value={page.language} />
              </dd>
            </div>
            <div>
              <dt>Robots directives</dt>
              <dd>
                {page.robotsDirectives.length > 0
                  ? page.robotsDirectives.join(", ")
                  : "None recorded"}
              </dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd>
                <Value value={page.viewport} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="page-detail-card">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Document outline</p>
            <h2>Headings</h2>
          </div>
          <div className="page-metric-grid">
            {headingMetrics.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value ?? "N/A"}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="page-detail-card">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Response</p>
            <h2>Technical details</h2>
          </div>
          <dl className="page-definition-list compact">
            <div>
              <dt>Content type</dt>
              <dd>
                <Value value={page.contentType} />
              </dd>
            </div>
            <div>
              <dt>Normalized URL</dt>
              <dd>
                <FullValue value={page.normalizedUrl} />
              </dd>
            </div>
            <div>
              <dt>Crawled at</dt>
              <dd>{formatDate(page.crawledAt)}</dd>
            </div>
            <div>
              <dt>Redirects</dt>
              <dd>{page.redirectCount}</dd>
            </div>
            <div>
              <dt>Final redirect URL</dt>
              <dd>
                <FullValue value={page.redirectUrl} />
              </dd>
            </div>
          </dl>
        </section>

        {page.redirectChain.length > 0 ? (
          <section className="page-detail-card page-detail-card-wide">
            <div className="page-detail-card-heading">
              <p className="page-eyebrow">Navigation</p>
              <h2>Redirect chain</h2>
            </div>
            <ol className="page-redirect-list">
              {page.redirectChain.map((redirect, index) => (
                <li key={`${redirect.sourceUrl}-${index}`}>
                  <code>{redirect.statusCode}</code>
                  <span title={redirect.sourceUrl}>{redirect.sourceUrl}</span>
                  <span>→</span>
                  <span title={redirect.destinationUrl}>
                    {redirect.destinationUrl}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="page-detail-card page-detail-card-wide">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Extracted counts</p>
            <h2>Content and resources</h2>
          </div>
          <div className="page-metric-grid page-resource-grid">
            {resourceMetrics.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value ?? "N/A"}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="page-detail-card">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Social sharing</p>
            <h2>Open Graph</h2>
          </div>
          <dl className="page-definition-list compact">
            <div>
              <dt>Title</dt>
              <dd>
                <Value value={page.openGraphTitle} />
              </dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>
                <Value value={page.openGraphDescription} />
              </dd>
            </div>
            <div>
              <dt>Image</dt>
              <dd>
                <Value value={page.openGraphImage} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="page-detail-card">
          <div className="page-detail-card-heading">
            <p className="page-eyebrow">Social sharing</p>
            <h2>Twitter metadata</h2>
          </div>
          <dl className="page-definition-list compact">
            <div>
              <dt>Card</dt>
              <dd>
                <Value value={page.twitterCard} />
              </dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>
                <Value value={page.twitterTitle} />
              </dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>
                <Value value={page.twitterDescription} />
              </dd>
            </div>
            <div>
              <dt>Image</dt>
              <dd>
                <Value value={page.twitterImage} />
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="page-associated-findings">
        <div className="page-associated-heading">
          <div>
            <p className="page-eyebrow">Audit analysis</p>
            <h2>Associated findings</h2>
          </div>
          <span>{detail.findingTotal}</span>
        </div>
        {detail.findings.length > 0 ? (
          <div className="page-finding-list">
            {detail.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                auditId={detail.audit.id}
                affectedUrl={page.url}
              />
            ))}
            {detail.findingTotal > detail.findings.length ? (
              <p className="page-finding-limit">
                Showing the 250 highest-impact findings of {detail.findingTotal}
                associated with this page.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="page-detail-empty">
            <h3>No page-specific findings</h3>
            <p>
              The evaluated audit engines did not associate a finding with this
              page. Site-wide findings remain available in the issue explorer.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
