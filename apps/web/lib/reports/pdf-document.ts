import type {
  PdfAuditReportData,
  PdfReportFinding,
} from "@website-audit/database";
import type { PriorityActionPlan } from "@website-audit/audit-core";
import PDFDocument from "pdfkit";

const palette = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  border: "#dbe4ee",
  panel: "#f8fafc",
  cyan: "#0891b2",
  cyanSoft: "#ecfeff",
  green: "#059669",
  greenSoft: "#ecfdf5",
  amber: "#d97706",
  amberSoft: "#fffbeb",
  red: "#e11d48",
  redSoft: "#fff1f2",
  indigo: "#4f46e5",
} as const;

const scoreOrder = [
  ["OVERALL", "Overall"],
  ["SEO", "SEO"],
  ["TECHNICAL", "Technical"],
  ["PERFORMANCE", "Performance"],
  ["ACCESSIBILITY", "Accessibility"],
  ["SECURITY", "Security"],
  ["MOBILE", "Mobile"],
] as const;

const performanceMetricLabels = [
  ["score", "Score"],
  ["lcp_ms", "Largest Contentful Paint"],
  ["inp_ms", "Interaction to Next Paint"],
  ["cls", "Cumulative Layout Shift"],
  ["fcp_ms", "First Contentful Paint"],
  ["ttfb_ms", "Time to First Byte"],
  ["speed_index_ms", "Speed Index"],
  ["total_blocking_time_ms", "Total Blocking Time"],
] as const;

type ScoreCategory = (typeof scoreOrder)[number][0];
type FindingSeverity = PdfReportFinding["severity"];

export type PdfAuditDocumentData = PdfAuditReportData & {
  actionPlan: PriorityActionPlan;
};

function cleanText(value: string, maximum = 1_000): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "Not available";
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} sec`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function scoreTone(score: number): { color: string; label: string } {
  if (score >= 90) return { color: palette.green, label: "Excellent" };
  if (score >= 70) return { color: palette.cyan, label: "Healthy" };
  if (score >= 50) return { color: palette.amber, label: "Needs attention" };
  return { color: palette.red, label: "Priority fixes required" };
}

function ensureSpace(
  document: PDFKit.PDFDocument,
  requiredHeight: number,
): void {
  const availableBottom =
    document.page.height - document.page.margins.bottom - 22;
  if (document.y + requiredHeight > availableBottom) document.addPage();
}

function sectionHeading(
  document: PDFKit.PDFDocument,
  eyebrow: string,
  title: string,
  description?: string,
): void {
  ensureSpace(document, description ? 74 : 54);
  document
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(palette.cyan)
    .text(eyebrow.toUpperCase(), { characterSpacing: 1.2 });
  document
    .moveDown(0.42)
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(palette.ink)
    .text(title);
  if (description) {
    document
      .moveDown(0.35)
      .font("Helvetica")
      .fontSize(9)
      .fillColor(palette.muted)
      .text(description, { lineGap: 2 });
  }
  document.moveDown(0.8);
}

function drawLogo(document: PDFKit.PDFDocument, x: number, y: number): void {
  document.save();
  document.roundedRect(x, y, 31, 31, 8).fill(palette.ink);
  document
    .lineWidth(2.2)
    .strokeColor("#67e8f9")
    .moveTo(x + 9, y + 16)
    .lineTo(x + 14, y + 21)
    .lineTo(x + 23, y + 10)
    .stroke();
  document
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(palette.ink)
    .text("SiteSignal", x + 42, y + 6, { lineBreak: false });
  document
    .font("Helvetica")
    .fontSize(7)
    .fillColor(palette.muted)
    .text("WEBSITE AUDIT INTELLIGENCE", x + 42, y + 22, {
      characterSpacing: 0.75,
      lineBreak: false,
    });
  document.restore();
}

function drawCover(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  const { left, right } = document.page.margins;
  const width = document.page.width - left - right;
  drawLogo(document, left, 48);
  document
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(palette.cyan)
    .text("CLIENT-READY WEBSITE AUDIT", left, 128, {
      characterSpacing: 1.35,
    });
  document
    .font("Helvetica-Bold")
    .fontSize(31)
    .fillColor(palette.ink)
    .text(cleanText(data.website.name, 100), left, 151, {
      width,
      lineGap: 2,
    });
  document
    .moveDown(0.35)
    .font("Helvetica")
    .fontSize(11)
    .fillColor(palette.cyan)
    .text(cleanText(data.website.url, 220), { width });

  const cardY = Math.max(document.y + 34, 255);
  document.roundedRect(left, cardY, width, 126, 12).fill(palette.ink);
  const columns = [
    ["Audit date", `${formatDate(data.audit.completedAt)} (IST)`],
    ["Audit type", data.audit.type.replaceAll("_", " ")],
    ["Pages audited", data.audit.pagesCrawled.toLocaleString("en-IN")],
    ["Duration", formatDuration(data.audit.durationMs)],
  ] as const;
  const columnWidth = width / columns.length;
  for (const [index, [label, value]] of columns.entries()) {
    const x = left + index * columnWidth + 15;
    if (index > 0) {
      document
        .moveTo(left + index * columnWidth, cardY + 18)
        .lineTo(left + index * columnWidth, cardY + 108)
        .lineWidth(0.6)
        .strokeColor("#334155")
        .stroke();
    }
    document
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#94a3b8")
      .text(label.toUpperCase(), x, cardY + 27, {
        width: columnWidth - 30,
        characterSpacing: 0.7,
      });
    document
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#f8fafc")
      .text(cleanText(value, 80), x, cardY + 52, {
        width: columnWidth - 30,
        height: 48,
      });
  }
  document
    .font("Helvetica")
    .fontSize(9)
    .fillColor(palette.muted)
    .text(
      "Prepared from observed crawl data and deterministic audit checks. Unavailable engines are shown as N/A and are never inferred.",
      left,
      cardY + 157,
      { width, lineGap: 3 },
    );
  document.y = cardY + 206;
}

function executiveSummary(data: PdfAuditReportData): string {
  const overall = data.scores.find(
    (score) => score.category === "OVERALL" && score.evaluated,
  );
  const opening = overall
    ? `The audited website achieved an overall health score of ${Math.round(overall.score)} out of 100, rated ${scoreTone(overall.score).label.toLowerCase()}.`
    : "An overall health score was unavailable because no scored audit engines completed successfully.";
  const issueSummary = `${data.issueCounts.CRITICAL} critical findings, ${data.issueCounts.WARNING} warnings, and ${data.issueCounts.RECOMMENDATION} recommendations were recorded across ${data.audit.pagesCrawled} crawled pages.`;
  const direction =
    data.issueCounts.CRITICAL > 0
      ? "Critical findings should be addressed first, followed by high-impact warnings that affect broad page coverage."
      : data.issueCounts.WARNING > 0
        ? "No critical findings were recorded; remediation should focus on the highest-impact warnings and recurring patterns."
        : "No critical findings or warnings were recorded by the evaluated engines; review recommendations for incremental improvements.";
  return `${opening} ${issueSummary} ${direction}`;
}

function drawExecutiveSummary(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  sectionHeading(document, "Executive summary", "Audit health at a glance");
  const x = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const text = executiveSummary(data);
  const textHeight = document
    .font("Helvetica")
    .fontSize(10)
    .heightOfString(text, { width: width - 34, lineGap: 4 });
  document
    .roundedRect(x, document.y, width, textHeight + 32, 10)
    .fill(palette.cyanSoft);
  document
    .font("Helvetica")
    .fontSize(10)
    .fillColor(palette.body)
    .text(text, x + 17, document.y + 16, {
      width: width - 34,
      lineGap: 4,
    });
  document.y += 18;
  document.moveDown(1.25);
}

function drawScores(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  sectionHeading(
    document,
    "Health scores",
    "Overall and category performance",
    "Only evaluated engines contribute to the overall score. N/A means the engine did not return reliable results.",
  );
  const scoreByCategory = new Map(
    data.scores.map((score) => [score.category, score]),
  );
  const left = document.page.margins.left;
  const contentWidth =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const gap = 8;
  const cardsPerRow = 4;
  const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardHeight = 82;
  const top = document.y;
  for (const [index, [category, label]] of scoreOrder.entries()) {
    const row = Math.floor(index / cardsPerRow);
    const column = index % cardsPerRow;
    const x = left + column * (cardWidth + gap);
    const y = top + row * (cardHeight + gap);
    const score = scoreByCategory.get(category);
    const available = score?.evaluated === true;
    const tone = available ? scoreTone(score.score) : null;
    document.roundedRect(x, y, cardWidth, cardHeight, 8).fill(palette.panel);
    document
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(palette.muted)
      .text(label.toUpperCase(), x + 11, y + 11, {
        width: cardWidth - 22,
        characterSpacing: 0.6,
      });
    document
      .font("Helvetica-Bold")
      .fontSize(23)
      .fillColor(tone?.color ?? palette.faint)
      .text(available ? `${Math.round(score.score)}` : "N/A", x + 11, y + 30, {
        width: cardWidth - 22,
      });
    document
      .font("Helvetica")
      .fontSize(7)
      .fillColor(palette.muted)
      .text(
        available ? (tone?.label ?? "Evaluated") : "Not evaluated",
        x + 11,
        y + 62,
        {
          width: cardWidth - 22,
        },
      );
  }
  const rows = Math.ceil(scoreOrder.length / cardsPerRow);
  document.y = top + rows * cardHeight + (rows - 1) * gap + 20;
}

function drawIssueCounts(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  ensureSpace(document, 110);
  const values = [
    ["Critical", data.issueCounts.CRITICAL, palette.red, palette.redSoft],
    ["Warnings", data.issueCounts.WARNING, palette.amber, palette.amberSoft],
    [
      "Recommendations",
      data.issueCounts.RECOMMENDATION,
      palette.indigo,
      "#eef2ff",
    ],
    [
      "Passed checks",
      data.issueCounts.PASSED,
      palette.green,
      palette.greenSoft,
    ],
  ] as const;
  const left = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const gap = 8;
  const itemWidth = (width - gap * 3) / 4;
  const top = document.y;
  for (const [index, [label, value, color, background]] of values.entries()) {
    const x = left + index * (itemWidth + gap);
    document.roundedRect(x, top, itemWidth, 70, 8).fill(background);
    document
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(color)
      .text(String(value), x + 12, top + 12, { width: itemWidth - 24 });
    document
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(palette.body)
      .text(label.toUpperCase(), x + 12, top + 45, {
        width: itemWidth - 24,
        characterSpacing: 0.55,
      });
  }
  document.y = top + 90;
}

function severityStyle(severity: FindingSeverity): {
  color: string;
  background: string;
} {
  if (severity === "CRITICAL") {
    return { color: palette.red, background: palette.redSoft };
  }
  if (severity === "WARNING") {
    return { color: palette.amber, background: palette.amberSoft };
  }
  return { color: palette.indigo, background: "#eef2ff" };
}

function drawFinding(
  document: PDFKit.PDFDocument,
  finding: PdfReportFinding,
  number: number,
): void {
  const left = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const description = cleanText(finding.description, 360);
  const recommendation = cleanText(finding.recommendation, 390);
  const url = finding.affectedUrl
    ? cleanText(finding.affectedUrl, 180)
    : `Site-wide pattern (${finding.occurrences} occurrence${finding.occurrences === 1 ? "" : "s"})`;
  document.font("Helvetica").fontSize(8.5);
  const bodyHeight =
    document.heightOfString(description, { width: width - 34, lineGap: 2 }) +
    document.heightOfString(recommendation, { width: width - 34, lineGap: 2 });
  const cardHeight = Math.max(132, bodyHeight + 100);
  ensureSpace(document, cardHeight + 10);
  const top = document.y;
  const style = severityStyle(finding.severity);
  document.roundedRect(left, top, width, cardHeight, 9).fill(palette.panel);
  document.roundedRect(left, top, 4, cardHeight, 2).fill(style.color);
  document
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(style.color)
    .text(`${number}. ${finding.severity}`, left + 17, top + 14, {
      width: 110,
      characterSpacing: 0.45,
    });
  document
    .font("Helvetica")
    .fontSize(7)
    .fillColor(palette.muted)
    .text(cleanText(finding.ruleCode, 90), left + 135, top + 14, {
      width: width - 152,
      align: "right",
    });
  document
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(palette.ink)
    .text(cleanText(finding.title, 180), left + 17, top + 34, {
      width: width - 34,
    });
  document
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(palette.cyan)
    .text(url, left + 17, document.y + 5, { width: width - 34 });
  document
    .moveDown(0.65)
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(palette.body)
    .text(description, { width: width - 34, lineGap: 2 });
  document
    .moveDown(0.55)
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(palette.muted)
    .text("RECOMMENDED ACTION", { characterSpacing: 0.55 });
  document
    .moveDown(0.25)
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(palette.body)
    .text(recommendation, { width: width - 34, lineGap: 2 });
  document.y = top + cardHeight + 10;
}

function drawFindingSection(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
  severity: FindingSeverity,
  heading: string,
  description: string,
): void {
  const findings = data.findings
    .filter((finding) => finding.severity === severity)
    .slice(0, 12);
  sectionHeading(document, severity, heading, description);
  if (findings.length === 0) {
    const left = document.page.margins.left;
    const width =
      document.page.width -
      document.page.margins.left -
      document.page.margins.right;
    document
      .roundedRect(left, document.y, width, 48, 8)
      .fill(palette.greenSoft);
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor(palette.green)
      .text(
        `No ${heading.toLowerCase()} were recorded.`,
        left + 14,
        document.y + 17,
        {
          width: width - 28,
        },
      );
    document.y += 68;
    return;
  }
  findings.forEach((finding, index) =>
    drawFinding(document, finding, index + 1),
  );
  const total = data.issueCounts[severity];
  if (total > findings.length) {
    document
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(palette.muted)
      .text(
        `Showing the 12 highest-impact items from ${total} ${heading.toLowerCase()}. The complete issue inventory remains available in SiteSignal.`,
        { lineGap: 2 },
      );
    document.moveDown(1);
  }
}

function formatMetric(value: number, unit: string | null, key: string): string {
  if (unit === "boolean") return value === 1 ? "Yes" : "No";
  if (key.endsWith(".score")) return `${Math.round(value)}/100`;
  if (key.endsWith(".cls")) return value.toFixed(3);
  if (unit === "ms") {
    return value >= 1_000
      ? `${(value / 1_000).toFixed(2)} s`
      : `${Math.round(value)} ms`;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function drawMetricTable(
  document: PDFKit.PDFDocument,
  rows: ReadonlyArray<readonly [string, string]>,
): void {
  const left = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  for (const [index, [label, value]] of rows.entries()) {
    ensureSpace(document, 31);
    const y = document.y;
    if (index % 2 === 0) {
      document.rect(left, y - 4, width, 27).fill(palette.panel);
    }
    document
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(palette.body)
      .text(label, left + 10, y + 4, { width: width * 0.68 });
    document
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(palette.ink)
      .text(value, left + width * 0.7, y + 4, {
        width: width * 0.27 - 10,
        align: "right",
      });
    document.y = y + 29;
  }
  document.moveDown(0.8);
}

function drawPerformance(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  sectionHeading(
    document,
    "Performance",
    "PageSpeed metrics",
    "Measured Google PageSpeed results for the audited homepage. Missing metrics are omitted rather than estimated.",
  );
  const metricByKey = new Map(
    data.metrics.map((metric) => [metric.key, metric]),
  );
  let rendered = false;
  for (const strategy of ["mobile", "desktop"] as const) {
    const rows: Array<readonly [string, string]> = [];
    for (const [key, label] of performanceMetricLabels) {
      const metric = metricByKey.get(
        `performance.pagespeed.${strategy}.${key}`,
      );
      if (metric)
        rows.push([label, formatMetric(metric.value, metric.unit, metric.key)]);
    }
    if (rows.length === 0) continue;
    rendered = true;
    ensureSpace(document, 54);
    document
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(palette.ink)
      .text(`${strategy === "mobile" ? "Mobile" : "Desktop"} analysis`);
    document.moveDown(0.5);
    drawMetricTable(document, rows);
  }
  if (!rendered) {
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor(palette.muted)
      .text("Performance metrics were unavailable for this audit.");
    document.moveDown(1.2);
  }
}

function metricValue(data: PdfAuditReportData, key: string): number | null {
  return data.metrics.find((metric) => metric.key === key)?.value ?? null;
}

function scoreValue(
  data: PdfAuditReportData,
  category: ScoreCategory,
): number | null {
  const score = data.scores.find(
    (candidate) => candidate.category === category && candidate.evaluated,
  );
  return score?.score ?? null;
}

function drawEngineOverview(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
  engine: "SECURITY" | "ACCESSIBILITY",
): void {
  const security = engine === "SECURITY";
  const score = scoreValue(data, engine);
  const rows: Array<readonly [string, string]> = security
    ? [
        ["Security score", score === null ? "N/A" : `${Math.round(score)}/100`],
        [
          "Pages evaluated",
          String(metricValue(data, "security.pages_evaluated") ?? "N/A"),
        ],
        [
          "TLS availability observed",
          metricValue(data, "security.tls_available_observed") === null
            ? "Unable to determine"
            : metricValue(data, "security.tls_available_observed") === 1
              ? "Yes"
              : "No",
        ],
        [
          "HTTP to HTTPS redirect observed",
          metricValue(data, "security.http_to_https_observed") === null
            ? "Unable to determine"
            : metricValue(data, "security.http_to_https_observed") === 1
              ? "Yes"
              : "No",
        ],
        [
          "Confirmed missing checks",
          String(
            metricValue(data, "security.confirmed_missing_checks") ?? "N/A",
          ),
        ],
        [
          "Observed insecure checks",
          String(
            metricValue(data, "security.observed_insecure_checks") ?? "N/A",
          ),
        ],
        [
          "Unable to determine",
          String(metricValue(data, "security.unknown_checks") ?? "N/A"),
        ],
      ]
    : [
        [
          "Accessibility score",
          score === null ? "N/A" : `${Math.round(score)}/100`,
        ],
        [
          "Candidate pages",
          String(
            metricValue(data, "accessibility.browser_candidate_pages") ?? "N/A",
          ),
        ],
        [
          "Pages selected for browser checks",
          String(
            metricValue(data, "accessibility.browser_selected_pages") ?? "N/A",
          ),
        ],
        [
          "Pages analyzed",
          String(
            metricValue(data, "accessibility.browser_analyzed_pages") ?? "N/A",
          ),
        ],
        [
          "Pages unavailable",
          String(
            metricValue(data, "accessibility.browser_failed_pages") ?? "N/A",
          ),
        ],
      ];
  sectionHeading(
    document,
    engine,
    `${security ? "Security" : "Accessibility"} overview`,
    security
      ? "Passive observations only. This report does not claim penetration testing or exploit validation."
      : "Browser-based checks are limited to the bounded page sample configured for the audit.",
  );
  drawMetricTable(document, rows);
}

function drawActionPlan(
  document: PDFKit.PDFDocument,
  data: PdfAuditDocumentData,
): void {
  sectionHeading(
    document,
    "Priority action plan",
    "Recommended remediation order",
    "Calculated deterministically from severity, score impact, affected-page coverage, and category importance. Verify changes with a fresh audit after deployment.",
  );
  if (data.actionPlan.items.length === 0) {
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor(palette.muted)
      .text("No failing findings were recorded by the evaluated engines.");
    document.moveDown(1.2);
    return;
  }
  const left = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  let actionNumber = 0;
  for (const group of data.actionPlan.groups) {
    if (group.items.length === 0) continue;
    ensureSpace(document, 34);
    document
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(
        group.priority === 1
          ? palette.red
          : group.priority === 2
            ? palette.amber
            : palette.indigo,
      )
      .text(group.label, left, document.y, { width });
    document
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(palette.muted)
      .text(group.description, left, document.y + 3, { width });
    document.moveDown(0.8);

    for (const item of group.items) {
      actionNumber += 1;
      const action = cleanText(item.recommendation, 300);
      const coverage = `${item.affectedPageCount}/${item.evaluatedPageCount} pages (${item.affectedPagePercentage}%) · ${item.category} · impact ${item.scoreImpact}`;
      document.font("Helvetica").fontSize(8.5);
      const height = Math.max(
        72,
        document.heightOfString(action, { width: width - 58, lineGap: 2 }) + 52,
      );
      ensureSpace(document, height + 8);
      const top = document.y;
      document.roundedRect(left, top, width, height, 8).fill(palette.panel);
      document.circle(left + 22, top + 22, 11).fill(palette.ink);
      document
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#ffffff")
        .text(String(actionNumber), left + 16, top + 18, {
          width: 12,
          align: "center",
        });
      document
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(palette.ink)
        .text(cleanText(item.title, 170), left + 44, top + 12, {
          width: width - 58,
        });
      document
        .font("Helvetica")
        .fontSize(7)
        .fillColor(palette.muted)
        .text(coverage, left + 44, document.y + 3, { width: width - 58 });
      document
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(palette.body)
        .text(action, left + 44, document.y + 5, {
          width: width - 58,
          lineGap: 2,
        });
      document.y = top + height + 8;
    }
  }
  if (data.actionPlan.omittedRuleCount > 0 || data.priorityFindingsTruncated) {
    ensureSpace(document, 28);
    const omitted =
      data.actionPlan.omittedRuleCount > 0
        ? `${data.actionPlan.omittedRuleCount} lower-ranked rules remain available in the issue explorer. `
        : "";
    const truncated = data.priorityFindingsTruncated
      ? "The source finding set reached its report safety limit."
      : "";
    document
      .font("Helvetica-Oblique")
      .fontSize(7.5)
      .fillColor(palette.muted)
      .text(`${omitted}${truncated}`, left, document.y + 2, { width });
    document.moveDown(0.7);
  }
}

function drawPages(
  document: PDFKit.PDFDocument,
  data: PdfAuditReportData,
): void {
  sectionHeading(
    document,
    "Pages audited",
    `${data.pageTotal.toLocaleString("en-IN")} crawled page records`,
    `The audit discovered ${data.audit.pagesDiscovered.toLocaleString("en-IN")} URLs and crawled ${data.audit.pagesCrawled.toLocaleString("en-IN")}. The table contains a bounded client-ready sample.`,
  );
  if (data.pages.length === 0) {
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor(palette.muted)
      .text("No page inventory was stored for this audit.");
    return;
  }
  const left = document.page.margins.left;
  const width =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  for (const [index, page] of data.pages.entries()) {
    ensureSpace(document, 48);
    const top = document.y;
    if (index % 2 === 0) {
      document.rect(left, top - 4, width, 41).fill(palette.panel);
    }
    document
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(palette.ink)
      .text(cleanText(page.title ?? "Untitled page", 110), left + 9, top + 2, {
        width: width - 128,
      });
    document
      .font("Helvetica")
      .fontSize(6.8)
      .fillColor(palette.muted)
      .text(cleanText(page.url, 170), left + 9, top + 18, {
        width: width - 128,
      });
    document
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(
        page.statusCode === null || page.statusCode >= 400
          ? palette.red
          : page.statusCode >= 300
            ? palette.amber
            : palette.green,
      )
      .text(
        page.statusCode === null ? "Error" : String(page.statusCode),
        left + width - 104,
        top + 7,
        {
          width: 38,
          align: "right",
        },
      );
    document
      .font("Helvetica")
      .fontSize(7)
      .fillColor(page.indexable ? palette.green : palette.muted)
      .text(
        page.indexable ? "Indexable" : "Not indexable",
        left + width - 62,
        top + 7,
        {
          width: 54,
          align: "right",
        },
      );
    document.y = top + 43;
  }
  if (data.pageTotal > data.pages.length) {
    document
      .moveDown(0.6)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(palette.muted)
      .text(
        `Showing ${data.pages.length} of ${data.pageTotal} pages. The full page explorer remains available in SiteSignal.`,
      );
  }
}

function addFooters(document: PDFKit.PDFDocument, websiteName: string): void {
  const range = document.bufferedPageRange();
  const left = document.page.margins.left;
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    const footerY = document.page.height - 32;
    const width =
      document.page.width -
      document.page.margins.left -
      document.page.margins.right;
    document
      .moveTo(left, footerY - 8)
      .lineTo(left + width, footerY - 8)
      .lineWidth(0.5)
      .strokeColor(palette.border)
      .stroke();
    document
      .font("Helvetica")
      .fontSize(7)
      .fillColor(palette.faint)
      .text(
        `SiteSignal audit report | ${cleanText(websiteName, 70)}`,
        left,
        footerY,
        {
          width: width - 90,
          lineBreak: false,
        },
      );
    document.text(
      `Page ${page + 1} of ${range.count}`,
      left + width - 90,
      footerY,
      {
        width: 90,
        align: "right",
        lineBreak: false,
      },
    );
  }
}

export async function generateAuditPdf(
  data: PdfAuditDocumentData,
): Promise<Buffer> {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 46, right: 46, bottom: 54, left: 46 },
    bufferPages: true,
    compress: true,
    info: {
      Title: `${cleanText(data.website.name, 100)} website audit report`,
      Author: "SiteSignal",
      Subject: "Website audit report",
      Keywords:
        "SEO, technical SEO, performance, accessibility, security, mobile",
      CreationDate: data.audit.completedAt,
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  drawCover(document, data);
  drawExecutiveSummary(document, data);
  drawScores(document, data);
  drawIssueCounts(document, data);
  drawFindingSection(
    document,
    data,
    "CRITICAL",
    "Critical findings",
    "Confirmed high-priority findings that require immediate review.",
  );
  drawFindingSection(
    document,
    data,
    "WARNING",
    "Warnings",
    "Material issues that can reduce search visibility, quality, or user experience.",
  );
  drawFindingSection(
    document,
    data,
    "RECOMMENDATION",
    "Recommendations",
    "Evidence-backed opportunities for incremental improvement.",
  );
  drawPerformance(document, data);
  drawEngineOverview(document, data, "SECURITY");
  drawEngineOverview(document, data, "ACCESSIBILITY");
  drawActionPlan(document, data);
  drawPages(document, data);
  addFooters(document, data.website.name);
  document.end();
  return completed;
}
