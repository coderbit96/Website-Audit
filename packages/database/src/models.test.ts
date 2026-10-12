import assert from "node:assert/strict";
import test from "node:test";

import { Types } from "mongoose";
import { getEntitlements, PlanTier } from "@website-audit/shared";

import {
  AuditScoreCategory,
  AuditStatus,
  LeadRequestedService,
  LeadSource,
  NotificationType,
  ReportGenerationStatus,
  UsageMetric,
  UserRole,
} from "./enums.js";
import {
  AuditJobModel,
  AuditFindingModel,
  AuditMetricModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
  ClientModel,
  databaseModels,
  LeadModel,
  PlanModel,
  PaymentOrderModel,
  PublicAuditRateLimitModel,
  PublicAuditRequestModel,
  RateLimitCounterModel,
  ReportModel,
  UsageCreditModel,
  UsageRecordModel,
  UserModel,
  WebsiteModel,
  NotificationModel,
  WorkerHeartbeatModel,
} from "./models.js";

test("exports every foundational domain model", () => {
  assert.equal(databaseModels.length, 30);
  assert.equal(
    new Set(databaseModels.map((model) => model.modelName)).size,
    30,
  );
});

test("declares unique audit finding and metric identities", () => {
  assert.equal(AuditFindingModel.schema.options.autoIndex, false);
  assert.equal(AuditMetricModel.schema.options.autoIndex, false);
  assert.ok(
    AuditFindingModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.auditId === 1 &&
          keys.category === 1 &&
          keys.ruleCode === 1 &&
          keys.affectedUrl === 1 &&
          keys.affectedElement === 1 &&
          options.unique === true,
      ),
  );
  assert.ok(
    AuditMetricModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.auditId === 1 &&
          keys.category === 1 &&
          keys.key === 1 &&
          options.unique === true,
      ),
  );
});

test("keeps persisted plan defaults aligned with the central FREE policy", async () => {
  const entitlements = getEntitlements(PlanTier.FREE);
  const plan = new PlanModel({ slug: "free", name: "Free" });

  await plan.validate();
  assert.equal(plan.monthlyAuditLimit, entitlements.limits.monthlyAudits);
  assert.equal(plan.pagesPerAuditLimit, entitlements.limits.crawlPagesPerAudit);
  assert.equal(plan.workspaceMemberLimit, entitlements.limits.workspaceMembers);
});

test("stores canonical, workspace-scoped client management fields", async () => {
  const client = new ClientModel({
    workspaceId: new Types.ObjectId(),
    createdById: new Types.ObjectId(),
    companyName: "Acme Limited",
    normalizedCompanyName: "acme limited",
    contactName: "Asha Rao",
    name: "Asha Rao",
    company: "Acme Limited",
  });

  await client.validate();
  assert.equal(client.isActive, true);
  assert.ok(ClientModel.schema.path("companyName"));
  assert.ok(ClientModel.schema.path("contactName"));
  assert.ok(
    ClientModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.workspaceId === 1 &&
          keys.normalizedCompanyName === 1 &&
          options.unique === true,
      ),
  );
});

test("supports the notification center types and scoped unread index", () => {
  assert.deepEqual(
    [
      NotificationType.AUDIT_COMPLETED,
      NotificationType.AUDIT_FAILED,
      NotificationType.SCORE_DROPPED,
      NotificationType.CRITICAL_ISSUE_FOUND,
      NotificationType.SCHEDULED_AUDIT_COMPLETED,
      NotificationType.SUBSCRIPTION_LIMIT_REACHED,
      NotificationType.TEAM_INVITATION,
      NotificationType.REPORT_READY,
    ],
    [
      "AUDIT_COMPLETED",
      "AUDIT_FAILED",
      "SCORE_DROPPED",
      "CRITICAL_ISSUE_FOUND",
      "SCHEDULED_AUDIT_COMPLETED",
      "SUBSCRIPTION_LIMIT_REACHED",
      "TEAM_INVITATION",
      "REPORT_READY",
    ],
  );
  assert.ok(NotificationModel.schema.path("href"));
  assert.ok(
    NotificationModel.schema
      .indexes()
      .some(
        ([keys]) =>
          keys.userId === 1 &&
          keys.workspaceId === 1 &&
          keys.readAt === 1 &&
          keys.createdAt === -1,
      ),
  );
  assert.ok(
    NotificationModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.userId === 1 && keys.dedupeKey === 1 && options.unique === true,
      ),
  );
});

test("defines unique aggregate usage counters for standardized metrics", async () => {
  const record = new UsageRecordModel({
    counterKey: "workspace:AUDITS:2026-10-01T00:00:00.000Z",
    workspaceId: new Types.ObjectId(),
    metric: UsageMetric.AUDITS,
    quantity: 2,
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-11-01T00:00:00.000Z"),
  });

  await record.validate();
  assert.deepEqual(record.adjustmentKeys, []);
  assert.equal(
    UsageRecordModel.schema.path("adjustmentKeys").options.select,
    false,
  );
  assert.ok(
    UsageRecordModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.counterKey === 1 &&
          options.unique === true &&
          options.sparse === true,
      ),
  );
});

test("stores bounded, period-bound offline usage credits", async () => {
  const credit = new UsageCreditModel({
    workspaceId: new Types.ObjectId(),
    recipientUserId: new Types.ObjectId(),
    grantedById: new Types.ObjectId(),
    metric: UsageMetric.PAGES_CRAWLED,
    quantity: 500,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-01T00:00:00.000Z"),
  });
  await credit.validate();
  assert.equal(credit.quantity, 500);
  assert.ok(
    UsageCreditModel.schema
      .indexes()
      .some(([keys]) => keys.workspaceId === 1 && keys.metric === 1),
  );
  assert.ok(
    UsageCreditModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.requestKey === 1 &&
          options.unique === true &&
          options.sparse === true,
      ),
  );
});

test("payment orders require a priced paid plan and unique provider identities", async () => {
  const order = new PaymentOrderModel({
    workspaceId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    planId: new Types.ObjectId(),
    planTier: PlanTier.PRO,
    amountPaise: 99_900,
    currency: "INR",
    receipt: "ss_test_receipt",
    providerOrderId: "order_test",
  });
  await order.validate();
  assert.equal(order.status, "CREATED");
  assert.ok(
    PaymentOrderModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.providerOrderId === 1 && options.unique === true,
      ),
  );
  order.planTier = PlanTier.FREE;
  await assert.rejects(order.validate());
});

test("worker health uses a unique identity and an expiring heartbeat", () => {
  const indexes = WorkerHeartbeatModel.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) => keys.workerId === 1 && options.unique === true,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.lastSeenAt === 1 && options.expireAfterSeconds === 604_800,
    ),
  );
});

test("stores a bounded lead snapshot without client-controlled audit details", async () => {
  const lead = new LeadModel({
    name: "Jane Example",
    email: "  JANE@EXAMPLE.COM ",
    phone: "+91 98765 43210",
    websiteUrl: "https://example.com/",
    auditId: new Types.ObjectId(),
    auditScore: 82.5,
    topDetectedProblems: [
      {
        title: "Missing page title",
        category: "SEO",
        severity: "CRITICAL",
      },
    ],
    requestedService: LeadRequestedService.SEO,
    source: LeadSource.PUBLIC_AUDIT,
    dedupeKey: "a".repeat(64),
  });

  await lead.validate();
  assert.equal(lead.email, "jane@example.com");
  assert.equal(LeadModel.schema.path("clientIp"), undefined);
  assert.equal(LeadModel.schema.path("dedupeKey").options.select, false);
  assert.ok(
    LeadModel.schema
      .indexes()
      .some(
        ([keys, options]) => keys.dedupeKey === 1 && options.unique === true,
      ),
  );
});

test("applies safe user defaults and email normalization", async () => {
  const user = new UserModel({ email: "  Owner@Example.COM  " });

  assert.equal(user.email, "owner@example.com");
  assert.equal(user.role, UserRole.USER);
  await user.validate();
});

test("does not select password hashes by default", () => {
  assert.equal(UserModel.schema.path("passwordHash").options.select, false);
});

test("validates required audit references and status defaults", async () => {
  const incompleteAudit = new AuditModel();
  await assert.rejects(
    incompleteAudit.validate(),
    /websiteId.*required.*workspaceId.*required/i,
  );

  const audit = new AuditModel({
    workspaceId: new Types.ObjectId(),
    websiteId: new Types.ObjectId(),
  });

  assert.equal(audit.status, AuditStatus.QUEUED);
  assert.equal(audit.progress, 0);
  assert.equal(audit.currentStage, AuditStatus.QUEUED);
  assert.equal(audit.pagesDiscovered, 0);
  assert.equal(audit.pagesCrawled, 0);
  assert.equal(audit.usagePageReservation, 0);
  assert.equal(audit.statusMessage, "Waiting for an audit worker.");
  assert.deepEqual(audit.pipelineDiagnostics, []);
  await audit.validate();
});

test("stores bounded pipeline diagnostics and failure context", async () => {
  const audit = new AuditModel({
    workspaceId: new Types.ObjectId(),
    websiteId: new Types.ObjectId(),
    failureCode: "PAGESPEED_TIMEOUT",
    failureStage: AuditStatus.ANALYZING,
    failureStep: "PERFORMANCE",
    pipelineDiagnostics: [
      {
        engine: "PERFORMANCE",
        step: "PERFORMANCE",
        outcome: "UNAVAILABLE",
        code: "TIMEOUT",
        message: "PageSpeed timed out without failing the audit.",
        recordedAt: new Date(),
      },
    ],
  });

  await audit.validate();
  assert.equal(audit.pipelineDiagnostics[0]?.engine, "PERFORMANCE");
  assert.equal(audit.failureStage, AuditStatus.ANALYZING);
  assert.equal(audit.failureStep, "PERFORMANCE");
});

test("declares workspace audit-history indexes", () => {
  const indexes = AuditModel.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.workspaceId === 1 && keys.status === 1 && keys.createdAt === -1,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.workspaceId === 1 && keys.websiteId === 1 && keys.createdAt === -1,
    ),
  );
});

test("stores bounded robots and sitemap discovery metadata on an audit", async () => {
  const audit = new AuditModel({
    workspaceId: new Types.ObjectId(),
    websiteId: new Types.ObjectId(),
    crawlDiscovery: {
      robots: {
        url: "https://example.com/robots.txt",
        status: "FOUND",
        applied: true,
      },
      sitemap: {
        declaredUrls: ["https://example.com/sitemap.xml"],
        processedUrls: ["https://example.com/sitemap.xml"],
        pageUrls: ["https://example.com/page"],
        pageUrlsDiscovered: 1,
        rejectedUrlCount: 0,
        truncated: false,
      },
      internalLinkUrlsDiscovered: 2,
    },
  });

  await audit.validate();
  assert.equal(audit.crawlDiscovery?.robots.status, "FOUND");
  assert.deepEqual(audit.crawlDiscovery?.sitemap.pageUrls, [
    "https://example.com/page",
  ]);
});

test("declares the workspace URL uniqueness boundary", () => {
  const hasExpectedIndex = WebsiteModel.schema
    .indexes()
    .some(
      ([keys, options]) =>
        keys.workspaceId === 1 &&
        keys.normalizedUrl === 1 &&
        options.unique === true,
    );

  assert.equal(hasExpectedIndex, true);
});

test("keeps audit queue payloads minimal and claimable", async () => {
  const job = new AuditJobModel({ auditId: new Types.ObjectId() });

  assert.equal(job.status, AuditStatus.QUEUED);
  assert.equal(job.attempts, 0);
  assert.equal(job.maxAttempts, 3);
  assert.equal(AuditJobModel.schema.path("websiteId"), undefined);
  assert.equal(AuditJobModel.schema.path("workspaceId"), undefined);
  assert.ok(
    AuditJobModel.schema
      .indexes()
      .some(
        ([keys]) =>
          keys.status === 1 && keys.runAt === 1 && keys.priority === -1,
      ),
  );
  await job.validate();
});

test("stores expiring public audit access without raw client addresses", async () => {
  const request = new PublicAuditRequestModel({
    auditId: new Types.ObjectId(),
    websiteId: new Types.ObjectId(),
    publicTokenHash: "a".repeat(64),
    clientKeyHash: "b".repeat(64),
    targetHash: "c".repeat(64),
    targetUrl: "https://example.com/",
    normalizedUrl: "example.com",
    expiresAt: new Date(Date.now() + 60_000),
  });

  await request.validate();
  assert.equal(PublicAuditRequestModel.schema.path("ipAddress"), undefined);
  assert.ok(
    PublicAuditRequestModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.expiresAt === 1 && options.expireAfterSeconds === 0,
      ),
  );
});

test("declares atomic public audit rate-limit windows", async () => {
  const rateLimit = new PublicAuditRateLimitModel({
    scope: "CLIENT_HOUR",
    keyHash: "d".repeat(64),
    windowStart: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(rateLimit.count, 0);
  await rateLimit.validate();
  assert.ok(
    PublicAuditRateLimitModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.scope === 1 &&
          keys.keyHash === 1 &&
          keys.windowStart === 1 &&
          options.unique === true,
      ),
  );
});

test("declares expiring generic rate-limit counters without raw identifiers", async () => {
  const counter = new RateLimitCounterModel({
    scope: "LOGIN_CLIENT_MINUTE",
    keyHash: "a".repeat(64),
    windowStart: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await counter.validate();
  assert.equal(counter.count, 0);
  assert.ok(
    RateLimitCounterModel.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.scope === 1 &&
          keys.keyHash === 1 &&
          keys.windowStart === 1 &&
          options.unique === true,
      ),
  );
});

test("declares optional TTL cleanup across public audit output models", () => {
  for (const model of [
    WebsiteModel,
    AuditModel,
    AuditJobModel,
    AuditPageModel,
    AuditFindingModel,
    AuditScoreModel,
  ]) {
    assert.ok(model.schema.path("expiresAt"), `${model.modelName} can expire`);
  }
});

test("declares the crawler page fact fields", () => {
  for (const field of [
    "url",
    "normalizedUrl",
    "statusCode",
    "contentType",
    "title",
    "metaDescription",
    "canonicalUrl",
    "canonicalDeclarations",
    "redirectCount",
    "redirectChain",
    "fetchErrorCode",
    "robotsDirectives",
    "openGraphTitle",
    "twitterCard",
    "viewport",
    "isIndexable",
    "h2Count",
    "structuredDataCount",
    "formCount",
    "labelCount",
    "buttonCount",
    "scriptCount",
    "stylesheetCount",
    "iframeCount",
    "mixedContentResourceCount",
    "metadataTruncatedFields",
    "depth",
    "loadTimeMs",
    "pageSizeBytes",
  ]) {
    assert.ok(AuditPageModel.schema.path(field), `${field} should be stored`);
  }
});

test("declares the standardized audit finding fields and lookup index", () => {
  for (const field of [
    "ruleCode",
    "category",
    "severity",
    "title",
    "description",
    "affectedUrl",
    "evidence",
    "recommendation",
    "scoreImpact",
    "affectedPageCount",
    "evaluatedPageCount",
  ]) {
    assert.ok(
      AuditFindingModel.schema.path(field),
      `${field} should be stored`,
    );
  }
  assert.ok(
    AuditFindingModel.schema
      .indexes()
      .some(
        ([keys]) =>
          keys.auditId === 1 && keys.ruleCode === 1 && keys.affectedUrl === 1,
      ),
  );
});

test("stores overall and category score diagnostics", async () => {
  const score = new AuditScoreModel({
    auditId: new Types.ObjectId(),
    category: AuditScoreCategory.OVERALL,
    score: 87.5,
    evaluated: true,
    weight: 1,
    evaluatedWeight: 0.45,
    deduction: 12.5,
    passedCredit: 1,
    failingRuleCount: 3,
    passedRuleCount: 2,
  });

  await score.validate();
  assert.equal(score.category, "OVERALL");
  for (const field of [
    "evaluated",
    "weight",
    "evaluatedWeight",
    "deduction",
    "passedCredit",
    "failingRuleCount",
    "passedRuleCount",
  ]) {
    assert.ok(AuditScoreModel.schema.path(field), `${field} should be stored`);
  }
});

test("stores PDF report generation metadata with safe defaults", async () => {
  const report = new ReportModel({
    workspaceId: new Types.ObjectId(),
    auditId: new Types.ObjectId(),
    title: "Example.com audit report",
  });

  assert.equal(report.status, ReportGenerationStatus.GENERATING);
  assert.equal(report.format, "PDF");
  assert.equal(report.mimeType, "application/pdf");
  await report.validate();

  for (const field of [
    "fileName",
    "fileSizeBytes",
    "checksumSha256",
    "failureReason",
    "generatedAt",
  ]) {
    assert.ok(ReportModel.schema.path(field), `${field} should be stored`);
  }
});
