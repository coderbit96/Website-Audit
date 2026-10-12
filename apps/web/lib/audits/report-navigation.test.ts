import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCategoryByReportTab,
  auditReportTabs,
  parseAuditReportTab,
} from "./report-navigation.js";

test("defines every report tab exactly once", () => {
  assert.deepEqual(auditReportTabs, [
    "overview",
    "seo",
    "technical",
    "performance",
    "accessibility",
    "security",
    "mobile",
    "pages",
    "issues",
  ]);
  assert.equal(new Set(auditReportTabs).size, auditReportTabs.length);
});

test("accepts safe report tabs and falls back to overview", () => {
  assert.equal(parseAuditReportTab("technical"), "technical");
  assert.equal(parseAuditReportTab(["pages", "issues"]), "pages");
  assert.equal(parseAuditReportTab("unknown"), "overview");
  assert.equal(parseAuditReportTab(undefined), "overview");
});

test("maps only engine tabs to authoritative finding categories", () => {
  assert.deepEqual(auditCategoryByReportTab, {
    seo: "SEO",
    technical: "TECHNICAL",
    performance: "PERFORMANCE",
    accessibility: "ACCESSIBILITY",
    security: "SECURITY",
    mobile: "MOBILE",
  });
  assert.equal(auditCategoryByReportTab.overview, undefined);
  assert.equal(auditCategoryByReportTab.pages, undefined);
  assert.equal(auditCategoryByReportTab.issues, undefined);
});
