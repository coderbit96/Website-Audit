import assert from "node:assert/strict";
import test from "node:test";

import {
  PdfReportLevel,
  PlanTier,
  canAccessAuditHistory,
  canCompareAudits,
  canConsumeCrawlPages,
  canCreateClient,
  canCreateWebsite,
  canGenerateReport,
  canGenerateFullReport,
  canInviteTeamMember,
  canRunAudit,
  canScheduleAudit,
  canUseWhiteLabel,
  getAuditQueuePriority,
  getEntitlements,
  getMaxCrawlPages,
  resolvePlanTier,
} from "./plan-entitlements.js";

test("defines immutable centralized limits for every plan", () => {
  const free = getEntitlements(PlanTier.FREE);
  const pro = getEntitlements(PlanTier.PRO);
  const agency = getEntitlements(PlanTier.AGENCY);

  assert.deepEqual(
    [free.limits.websites, pro.limits.websites, agency.limits.websites],
    [1, 5, 50],
  );
  assert.deepEqual(
    [
      free.limits.monthlyAudits,
      pro.limits.monthlyAudits,
      agency.limits.monthlyAudits,
    ],
    [3, 50, 250],
  );
  assert.equal(free.limits.crawlPagesPerAudit, 10);
  assert.equal(free.limits.crawledPagesPerBillingPeriod, 30);
  assert.equal(free.limits.reportGenerations, 3);
  assert.equal(pro.limits.crawlPagesPerAudit, 500);
  assert.equal(pro.limits.crawledPagesPerBillingPeriod, 25_000);
  assert.equal(pro.limits.reportGenerations, 100);
  assert.equal(agency.limits.crawlPagesPerAudit, 500);
  assert.equal(agency.limits.crawledPagesPerBillingPeriod, 125_000);
  assert.equal(agency.limits.reportGenerations, 500);
  assert.equal(free.pdfReportLevel, PdfReportLevel.BASIC);
  assert.equal(pro.pdfReportLevel, PdfReportLevel.FULL);
  assert.equal(agency.pdfReportLevel, PdfReportLevel.FULL);
  assert.equal(Object.isFrozen(free), true);
  assert.equal(Object.isFrozen(free.limits), true);
});

test("falls back unknown or missing persisted plan slugs to FREE", () => {
  assert.equal(resolvePlanTier(undefined), PlanTier.FREE);
  assert.equal(resolvePlanTier("legacy-enterprise"), PlanTier.FREE);
  assert.equal(resolvePlanTier(" pro "), PlanTier.PRO);
  assert.equal(resolvePlanTier("agency"), PlanTier.AGENCY);
});

test("enforces website and monthly audit limits at the boundary", () => {
  const free = getEntitlements(PlanTier.FREE);
  assert.equal(canCreateWebsite(free, 0), true);
  assert.equal(canCreateWebsite(free, 1), false);
  assert.equal(canRunAudit(free, 2), true);
  assert.equal(canRunAudit(free, 3), false);
  assert.equal(getMaxCrawlPages(free), 10);
  assert.equal(canConsumeCrawlPages(free, 20, 10), true);
  assert.equal(canConsumeCrawlPages(free, 21, 10), false);
  assert.equal(canGenerateReport(free, 2), true);
  assert.equal(canGenerateReport(free, 3), false);
});

test("exposes feature checks without plan-name branching at call sites", () => {
  const free = getEntitlements(PlanTier.FREE);
  const pro = getEntitlements(PlanTier.PRO);
  const agency = getEntitlements(PlanTier.AGENCY);

  assert.equal(canScheduleAudit(free), false);
  assert.equal(canScheduleAudit(pro, 9), true);
  assert.equal(canScheduleAudit(pro, 10), false);
  assert.equal(canAccessAuditHistory(pro), true);
  assert.equal(canCompareAudits(pro), true);
  assert.equal(canGenerateFullReport(pro), true);
  assert.equal(canUseWhiteLabel(pro), false);
  assert.equal(canInviteTeamMember(pro, 0), false);
  assert.equal(canCreateClient(pro, 0), false);
  assert.equal(canUseWhiteLabel(agency), true);
  assert.equal(canInviteTeamMember(agency, 19), true);
  assert.equal(canInviteTeamMember(agency, 20), false);
  assert.equal(canCreateClient(agency, 99), true);
  assert.equal(canCreateClient(agency, 100), false);
  assert.equal(getAuditQueuePriority(free), 0);
  assert.equal(getAuditQueuePriority(pro), 0);
  assert.equal(getAuditQueuePriority(agency), 10);
});
