import assert from "node:assert/strict";
import test from "node:test";

import { createPriorityActionPlan } from "@website-audit/audit-core";

import { generateAuditPdf, type PdfAuditDocumentData } from "./pdf-document.js";

const priorityFindings = [
  {
    category: "SECURITY",
    severity: "CRITICAL",
    ruleCode: "SEC_HTTPS_NOT_USED",
    title: "HTTPS is not in use",
    recommendation: "Serve the website over HTTPS and redirect HTTP traffic.",
    affectedUrl: "http://example.com/",
    scoreImpact: 20,
    affectedPageCount: 1,
    evaluatedPageCount: 10,
  },
  {
    category: "SEO",
    severity: "WARNING",
    ruleCode: "SEO_TITLE_MISSING",
    title: "Page title is missing",
    recommendation: "Add a concise, descriptive title element.",
    affectedUrl: "https://example.com/about",
    scoreImpact: 8,
    affectedPageCount: 1,
    evaluatedPageCount: 10,
  },
] as const;

const reportData: PdfAuditDocumentData = {
  audit: {
    id: "507f1f77bcf86cd799439011",
    type: "STANDARD",
    createdAt: new Date("2026-10-08T08:00:00.000Z"),
    completedAt: new Date("2026-10-08T08:02:30.000Z"),
    durationMs: 150_000,
    pagesDiscovered: 12,
    pagesCrawled: 10,
  },
  website: {
    id: "507f1f77bcf86cd799439012",
    name: "Example Website",
    url: "https://example.com/",
  },
  scores: [
    { category: "OVERALL", score: 76, evaluated: true },
    { category: "SEO", score: 82, evaluated: true },
    { category: "TECHNICAL", score: 70, evaluated: true },
    { category: "PERFORMANCE", score: 65, evaluated: true },
    { category: "ACCESSIBILITY", score: 0, evaluated: false },
    { category: "SECURITY", score: 90, evaluated: true },
    { category: "MOBILE", score: 74, evaluated: true },
  ],
  issueCounts: {
    CRITICAL: 1,
    WARNING: 1,
    RECOMMENDATION: 1,
    PASSED: 4,
  },
  findings: [
    {
      category: "SECURITY",
      severity: "CRITICAL",
      ruleCode: "SECURITY_HTTPS_MISSING",
      title: "HTTPS is not in use",
      description: "The audited page was observed over HTTP.",
      affectedUrl: "http://example.com/",
      recommendation: "Serve the website over HTTPS and redirect HTTP traffic.",
      scoreImpact: 20,
      occurrences: 1,
    },
    {
      category: "SEO",
      severity: "WARNING",
      ruleCode: "SEO_TITLE_MISSING",
      title: "Page title is missing",
      description: "One crawled page did not provide a title element.",
      affectedUrl: "https://example.com/about",
      recommendation: "Add a concise, descriptive title element.",
      scoreImpact: 8,
      occurrences: 1,
    },
    {
      category: "PERFORMANCE",
      severity: "RECOMMENDATION",
      ruleCode: "PERF_IMAGE_OPTIMIZATION",
      title: "Optimize large images",
      description: "PageSpeed identified image transfer savings.",
      affectedUrl: "https://example.com/",
      recommendation: "Resize and compress the identified images.",
      scoreImpact: 3,
      occurrences: 2,
    },
  ],
  priorityFindings: [...priorityFindings],
  priorityFindingsTruncated: false,
  actionPlan: createPriorityActionPlan(priorityFindings),
  metrics: [
    {
      category: "PERFORMANCE",
      key: "performance.pagespeed.mobile.score",
      value: 65,
      unit: "score",
    },
    {
      category: "PERFORMANCE",
      key: "performance.pagespeed.mobile.lcp_ms",
      value: 2_800,
      unit: "ms",
    },
    {
      category: "SECURITY",
      key: "security.pages_evaluated",
      value: 10,
      unit: "pages",
    },
  ],
  pages: [
    {
      url: "https://example.com/",
      title: "Example Website",
      statusCode: 200,
      indexable: true,
    },
    {
      url: "https://example.com/about",
      title: null,
      statusCode: 200,
      indexable: true,
    },
  ],
  pageTotal: 10,
};

test("generates a bounded server-side PDF audit report", async () => {
  const pdf = await generateAuditPdf(reportData);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdf.subarray(-32).toString("latin1"), /%%EOF/);
  assert.ok(pdf.byteLength > 5_000);
  assert.ok(pdf.byteLength < 5_000_000);
  assert.match(pdf.toString("latin1"), /\/Type \/Page/);
});
