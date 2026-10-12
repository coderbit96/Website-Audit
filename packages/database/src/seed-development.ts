import "dotenv/config";

import argon2 from "argon2";
import { createHash } from "node:crypto";
import {
  getEntitlements,
  getPlanDisplay,
  PlanTier,
  type PlanTier as PlanTierValue,
} from "@website-audit/shared";
import { parseDevelopmentSeedEnvironment } from "@website-audit/shared/environment/server";

import { connectToDatabase, disconnectFromDatabase } from "./connection.js";
import {
  AuditCategory,
  AuditScoreCategory,
  AuditStatus,
  AuditType,
  FindingSeverity,
  FindingStatus,
  NotificationType,
  ReportGenerationStatus,
  SubscriptionStatus,
  UserRole,
  WorkspaceRole,
} from "./enums.js";
import {
  AuditFindingModel,
  AuditJobModel,
  AuditMetricModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
  NotificationModel,
  PlanModel,
  ReportModel,
  SubscriptionModel,
  UserModel,
  WebsiteModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "./models.js";

const SEED_NAMESPACE = "sitesignal-development-seed-v1";
const DAY_MS = 24 * 60 * 60 * 1_000;

const scoreWeights = {
  [AuditScoreCategory.OVERALL]: 1,
  [AuditScoreCategory.SEO]: 0.25,
  [AuditScoreCategory.TECHNICAL]: 0.2,
  [AuditScoreCategory.PERFORMANCE]: 0.2,
  [AuditScoreCategory.ACCESSIBILITY]: 0.15,
  [AuditScoreCategory.SECURITY]: 0.1,
  [AuditScoreCategory.MOBILE]: 0.1,
} as const;

type DemoPersona = Readonly<{
  key: string;
  name: string;
  email: string;
  password: string;
  role: (typeof UserRole)[keyof typeof UserRole];
  plan: PlanTierValue;
  workspaceName: string;
  workspaceSlug: string;
  websiteName: string;
  websiteUrl: string;
  normalizedUrl: string;
  audits: ReadonlyArray<
    Readonly<{
      key: string;
      daysAgo: number;
      score: number;
      type: (typeof AuditType)[keyof typeof AuditType];
      pageCount: number;
      variant: "baseline" | "latest";
    }>
  >;
}>;

type SeedFinding = {
  key: string;
  auditPageId: string;
  category: (typeof AuditCategory)[keyof typeof AuditCategory];
  severity: (typeof FindingSeverity)[keyof typeof FindingSeverity];
  status: (typeof FindingStatus)[keyof typeof FindingStatus];
  ruleCode: string;
  title: string;
  description: string;
  affectedUrl: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  scoreImpact: number;
  affectedPageCount: number;
  evaluatedPageCount: number;
  occurrences: number;
  resolvedAt?: Date;
};

const demoPersonas: ReadonlyArray<DemoPersona> = [
  {
    key: "free",
    name: "Free Demo User",
    email: "free.demo@sitesignal.local",
    password: "DemoFree@123456",
    role: UserRole.USER,
    plan: PlanTier.FREE,
    workspaceName: "Free Demo Workspace",
    workspaceSlug: "demo-free-workspace",
    websiteName: "Free Demo Store",
    websiteUrl: "https://free-demo.example/",
    normalizedUrl: "free-demo.example",
    audits: [
      {
        key: "baseline",
        daysAgo: 21,
        score: 72,
        type: AuditType.QUICK,
        pageCount: 4,
        variant: "baseline",
      },
      {
        key: "latest",
        daysAgo: 2,
        score: 78,
        type: AuditType.QUICK,
        pageCount: 5,
        variant: "latest",
      },
    ],
  },
  {
    key: "pro",
    name: "Pro Demo User",
    email: "pro.demo@sitesignal.local",
    password: "DemoPro@123456",
    role: UserRole.USER,
    plan: PlanTier.PRO,
    workspaceName: "Pro Demo Workspace",
    workspaceSlug: "demo-pro-workspace",
    websiteName: "Pro Demo Studio",
    websiteUrl: "https://pro-demo.example/",
    normalizedUrl: "pro-demo.example",
    audits: [
      {
        key: "baseline",
        daysAgo: 17,
        score: 84,
        type: AuditType.STANDARD,
        pageCount: 6,
        variant: "baseline",
      },
      {
        key: "latest",
        daysAgo: 1,
        score: 89,
        type: AuditType.STANDARD,
        pageCount: 7,
        variant: "latest",
      },
    ],
  },
  {
    key: "agency",
    name: "Agency Demo User",
    email: "agency.demo@sitesignal.local",
    password: "DemoAgency@123456",
    role: UserRole.USER,
    plan: PlanTier.AGENCY,
    workspaceName: "Agency Demo Workspace",
    workspaceSlug: "demo-agency-workspace",
    websiteName: "Agency Demo Client",
    websiteUrl: "https://agency-demo.example/",
    normalizedUrl: "agency-demo.example",
    audits: [
      {
        key: "baseline",
        daysAgo: 14,
        score: 91,
        type: AuditType.FULL,
        pageCount: 7,
        variant: "baseline",
      },
      {
        key: "latest",
        daysAgo: 1,
        score: 94,
        type: AuditType.FULL,
        pageCount: 8,
        variant: "latest",
      },
    ],
  },
];

function stableId(key: string): string {
  return createHash("sha256")
    .update(`${SEED_NAMESPACE}:${key}`)
    .digest("hex")
    .slice(0, 24);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function dateDaysAgo(daysAgo: number, hour = 10): Date {
  const today = new Date();
  const utcMidnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    hour,
  );
  return new Date(utcMidnight - daysAgo * DAY_MS);
}

function categoryScores(overall: number) {
  return [
    [AuditScoreCategory.OVERALL, overall],
    [AuditScoreCategory.SEO, overall - 2],
    [AuditScoreCategory.TECHNICAL, overall - 4],
    [AuditScoreCategory.PERFORMANCE, overall - 7],
    [AuditScoreCategory.ACCESSIBILITY, overall - 1],
    [AuditScoreCategory.SECURITY, overall + 3],
    [AuditScoreCategory.MOBILE, overall + 1],
  ] as const;
}

function planCatalogEntry(plan: PlanTierValue) {
  const entitlements = getEntitlements(plan);
  const price = getPlanDisplay(plan).monthlyPriceCents;

  return {
    _id: stableId(`plan:${plan}`),
    slug: plan.toLowerCase(),
    name:
      plan === PlanTier.FREE
        ? "Free"
        : plan === PlanTier.PRO
          ? "Pro"
          : "Agency",
    description: `${plan === PlanTier.FREE ? "Starter" : plan === PlanTier.PRO ? "Professional" : "Agency"} development demo plan`,
    monthlyPriceCents: price,
    yearlyPriceCents: price * 10,
    monthlyAuditLimit: entitlements.limits.monthlyAudits,
    pagesPerAuditLimit: entitlements.limits.crawlPagesPerAudit,
    workspaceMemberLimit: entitlements.limits.workspaceMembers,
    features: entitlements.features,
    isActive: true,
  };
}

async function seedPlans(): Promise<ReadonlyMap<PlanTierValue, string>> {
  const ids = new Map<PlanTierValue, string>();

  for (const plan of [PlanTier.FREE, PlanTier.PRO, PlanTier.AGENCY]) {
    const entry = planCatalogEntry(plan);
    await PlanModel.findOneAndUpdate(
      { slug: entry.slug },
      { $set: entry },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).exec();
    ids.set(plan, entry._id);
  }

  return ids;
}

/** Removes only the Super Admin fixture produced by the first seed version. */
async function removeLegacyDemoAdminFixture(): Promise<void> {
  const userId = stableId("user:admin");
  const workspaceId = stableId("workspace:admin");
  const websiteId = stableId("website:admin");
  const auditId = stableId("audit:admin:latest");

  await Promise.all([
    AuditPageModel.deleteMany({ auditId }).exec(),
    AuditScoreModel.deleteMany({ auditId }).exec(),
    AuditFindingModel.deleteMany({ auditId }).exec(),
    AuditMetricModel.deleteMany({ auditId }).exec(),
    AuditJobModel.deleteOne({ auditId }).exec(),
    ReportModel.deleteOne({
      _id: stableId("report:admin"),
      workspaceId,
      auditId,
    }).exec(),
    NotificationModel.deleteMany({
      userId,
      workspaceId,
      dedupeKey: { $regex: `^${SEED_NAMESPACE}:admin:` },
    }).exec(),
    SubscriptionModel.deleteOne({
      _id: stableId("subscription:admin"),
      workspaceId,
    }).exec(),
  ]);

  await AuditModel.deleteOne({ _id: auditId, workspaceId, websiteId }).exec();
  await WebsiteModel.deleteOne({
    _id: websiteId,
    workspaceId,
    normalizedUrl: "admin-demo.example",
  }).exec();
  await WorkspaceMemberModel.deleteOne({
    _id: stableId("membership:admin"),
    workspaceId,
    userId,
  }).exec();
  await WorkspaceModel.deleteOne({
    _id: workspaceId,
    slug: "demo-admin-workspace",
  }).exec();
  await UserModel.deleteOne({
    _id: userId,
    email: "admin.demo@sitesignal.local",
  }).exec();
}

function pagePath(index: number): string {
  const paths = [
    "",
    "about",
    "services",
    "pricing",
    "contact",
    "blog",
    "guides",
    "support",
  ];
  return paths[index] ?? `page-${index + 1}`;
}

async function seedAudit(input: {
  persona: DemoPersona;
  userId: string;
  workspaceId: string;
  websiteId: string;
  audit: DemoPersona["audits"][number];
}): Promise<string> {
  const { persona, audit } = input;
  const auditId = stableId(`audit:${persona.key}:${audit.key}`);
  const startedAt = dateDaysAgo(audit.daysAgo, 9);
  const completedAt = new Date(
    startedAt.getTime() + 3 * 60 * 1_000 + audit.pageCount * 4_000,
  );
  const createdAt = new Date(startedAt.getTime() - 20_000);

  await AuditModel.findOneAndUpdate(
    { _id: auditId },
    {
      $set: {
        workspaceId: input.workspaceId,
        websiteId: input.websiteId,
        requestedById: input.userId,
        type: audit.type,
        status: AuditStatus.COMPLETED,
        progress: 100,
        currentStage: AuditStatus.COMPLETED,
        pagesDiscovered: audit.pageCount,
        pagesCrawled: audit.pageCount,
        usagePageReservation: audit.pageCount,
        statusMessage: "Audit completed successfully.",
        overallScore: audit.score,
        configuration: {
          maximumPages: audit.pageCount,
          maximumDepth: 3,
          respectRobotsTxt: true,
          checkExternalLinks: true,
          javascriptRendering: false,
          performanceAnalysis: true,
          accessibilityAnalysis: true,
          securityAnalysis: true,
          mobileAnalysis: true,
        },
        crawlDiscovery: {
          robots: {
            url: `${persona.websiteUrl}robots.txt`,
            status: "FOUND",
            applied: true,
          },
          sitemap: {
            declaredUrls: [`${persona.websiteUrl}sitemap.xml`],
            processedUrls: [`${persona.websiteUrl}sitemap.xml`],
            pageUrls: Array.from({ length: audit.pageCount }, (_, index) => {
              const path = pagePath(index);
              return path ? `${persona.websiteUrl}${path}` : persona.websiteUrl;
            }),
            pageUrlsDiscovered: audit.pageCount,
            rejectedUrlCount: 0,
            truncated: false,
          },
          internalLinkUrlsDiscovered: audit.pageCount,
        },
        pipelineDiagnostics: [],
        startedAt,
        completedAt,
        createdAt,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  await Promise.all([
    AuditPageModel.deleteMany({ auditId }).exec(),
    AuditScoreModel.deleteMany({ auditId }).exec(),
    AuditFindingModel.deleteMany({ auditId }).exec(),
    AuditMetricModel.deleteMany({ auditId }).exec(),
  ]);

  const pages = Array.from({ length: audit.pageCount }, (_, index) => {
    const path = pagePath(index);
    const url = path ? `${persona.websiteUrl}${path}` : persona.websiteUrl;
    return {
      _id: stableId(`page:${persona.key}:${audit.key}:${index}`),
      auditId,
      url,
      normalizedUrl: url,
      title: path
        ? `${path.charAt(0).toUpperCase()}${path.slice(1)} | ${persona.websiteName}`
        : `${persona.websiteName} | Website intelligence`,
      metaDescription: `Development demo content for ${persona.websiteName}.`,
      canonicalUrl: url,
      canonicalDeclarations: [url],
      contentType: "text/html; charset=utf-8",
      language: "en",
      robotsDirectives: ["index", "follow"],
      openGraphTitle: persona.websiteName,
      openGraphDescription: `Development demo content for ${persona.websiteName}.`,
      openGraphImage: `${persona.websiteUrl}og-image.png`,
      twitterCard: "summary_large_image",
      twitterTitle: persona.websiteName,
      twitterDescription: `Development demo content for ${persona.websiteName}.`,
      twitterImage: `${persona.websiteUrl}og-image.png`,
      viewport: "width=device-width, initial-scale=1",
      isIndexable: true,
      headingCount: 4,
      h1Count: 1,
      h2Count: 3,
      h3Count: 0,
      h4Count: 0,
      h5Count: 0,
      h6Count: 0,
      imageCount: 4,
      imagesMissingAlt: index === 1 && audit.variant === "latest" ? 1 : 0,
      internalLinkCount: Math.max(1, audit.pageCount - 1),
      externalLinkCount: 2,
      structuredDataCount: 1,
      invalidStructuredDataCount: 0,
      formCount: path === "contact" ? 1 : 0,
      formControlCount: path === "contact" ? 3 : 0,
      labeledFormControlCount: path === "contact" ? 3 : 0,
      labelCount: path === "contact" ? 3 : 0,
      buttonCount: 2,
      scriptCount: 5,
      stylesheetCount: 2,
      iframeCount: 0,
      mixedContentResourceCount: 0,
      metadataTruncatedFields: [],
      discoveredVia: index === 0 ? "ROOT" : "SITEMAP",
      statusCode: 200,
      depth: index === 0 ? 0 : 1,
      loadTimeMs: 420 + index * 75 + (100 - audit.score) * 12,
      pageSizeBytes: 86_000 + index * 7_500,
      crawledAt: new Date(startedAt.getTime() + 30_000 + index * 5_000),
      createdAt,
    };
  });
  await AuditPageModel.insertMany(pages, { ordered: true });

  await AuditScoreModel.insertMany(
    categoryScores(audit.score).map(([category, rawScore]) => {
      const score = clampScore(rawScore);
      return {
        _id: stableId(`score:${persona.key}:${audit.key}:${category}`),
        auditId,
        category,
        score,
        evaluated: true,
        weight: scoreWeights[category],
        evaluatedWeight: scoreWeights[category],
        deduction: 100 - score,
        passedCredit: Math.min(5, Math.round(score / 25)),
        failingRuleCount: score < 80 ? 3 : 2,
        passedRuleCount: 8,
        createdAt,
      };
    }),
    { ordered: true },
  );

  const homePageId = pages[0]?._id;
  const secondaryPageId = pages[1]?._id ?? homePageId;
  if (!homePageId || !secondaryPageId) {
    throw new Error(`Unable to create pages for development audit ${auditId}.`);
  }

  const findings: SeedFinding[] = [
    {
      key: "seo",
      auditPageId: secondaryPageId,
      category: AuditCategory.SEO,
      severity: FindingSeverity.WARNING,
      status:
        audit.variant === "baseline" ? FindingStatus.FIXED : FindingStatus.OPEN,
      ruleCode:
        audit.variant === "baseline"
          ? "SEO_TITLE_MISSING"
          : "SEO_IMAGE_ALT_MISSING",
      title:
        audit.variant === "baseline"
          ? "Page title is missing"
          : "Image alternative text is missing",
      description:
        audit.variant === "baseline"
          ? "One crawled page did not provide a descriptive title."
          : "One image does not have an alt attribute for assistive technology.",
      affectedUrl: pages[1]?.url ?? persona.websiteUrl,
      evidence:
        audit.variant === "baseline"
          ? { title: null, pageCount: 1 }
          : { selector: "main img", missingAltCount: 1 },
      recommendation:
        audit.variant === "baseline"
          ? "Add a unique, descriptive title to the page."
          : "Add concise alternative text that describes the image purpose.",
      scoreImpact: 6,
      affectedPageCount: 1,
      evaluatedPageCount: audit.pageCount,
      occurrences: 1,
      ...(audit.variant === "baseline" ? { resolvedAt: completedAt } : {}),
    },
    {
      key: "security",
      auditPageId: homePageId,
      category: AuditCategory.SECURITY,
      severity: FindingSeverity.WARNING,
      status: FindingStatus.OPEN,
      ruleCode: "SEC_HSTS_MISSING",
      title: "HSTS header is missing",
      description:
        "The HTTPS response did not include a Strict-Transport-Security header.",
      affectedUrl: persona.websiteUrl,
      evidence: { header: "strict-transport-security", observed: false },
      recommendation:
        "Add HSTS after confirming every subdomain is available over HTTPS.",
      scoreImpact: 4,
      affectedPageCount: 1,
      evaluatedPageCount: audit.pageCount,
      occurrences: 1,
    },
    {
      key: "performance",
      auditPageId: homePageId,
      category: AuditCategory.PERFORMANCE,
      severity: FindingSeverity.RECOMMENDATION,
      status: FindingStatus.OPEN,
      ruleCode: "PERF_LCP_NEEDS_IMPROVEMENT",
      title: "Largest Contentful Paint can be improved",
      description: "The measured mobile LCP is above the recommended target.",
      affectedUrl: persona.websiteUrl,
      evidence: { lcpMs: 2_700 + (100 - audit.score) * 20 },
      recommendation:
        "Optimize the main visual asset and prioritize critical rendering resources.",
      scoreImpact: 3,
      affectedPageCount: 1,
      evaluatedPageCount: 1,
      occurrences: 1,
    },
    {
      key: "passed",
      auditPageId: homePageId,
      category: AuditCategory.ACCESSIBILITY,
      severity: FindingSeverity.PASSED,
      status: FindingStatus.OPEN,
      ruleCode: "A11Y_HTML_LANG_PRESENT",
      title: "Page language is declared",
      description: "The audited page declares an HTML language.",
      affectedUrl: persona.websiteUrl,
      evidence: { language: "en" },
      recommendation:
        "Keep the language declaration accurate when page content changes.",
      scoreImpact: 0,
      affectedPageCount: 1,
      evaluatedPageCount: audit.pageCount,
      occurrences: 1,
    },
  ];

  if (audit.score < 80) {
    findings.unshift({
      key: "critical",
      auditPageId: homePageId,
      category: AuditCategory.TECHNICAL,
      severity: FindingSeverity.CRITICAL,
      status: FindingStatus.OPEN,
      ruleCode: "TECH_INDEXABILITY",
      title: "Important page is not indexable",
      description:
        "A robots directive prevents an important page from being indexed.",
      affectedUrl: persona.websiteUrl,
      evidence: { directive: "noindex", pageCount: 1 },
      recommendation:
        "Remove the noindex directive if the page should appear in search results.",
      scoreImpact: 12,
      affectedPageCount: 1,
      evaluatedPageCount: audit.pageCount,
      occurrences: 1,
    });
  }

  await AuditFindingModel.insertMany(
    findings.map((finding) => ({
      _id: stableId(`finding:${persona.key}:${audit.key}:${finding.key}`),
      auditId,
      createdAt,
      ...finding,
    })),
    { ordered: true },
  );

  const mobilePerformance = clampScore(audit.score - 7) / 100;
  await AuditMetricModel.insertMany(
    [
      {
        key: "performance.pagespeed.mobile.score",
        value: mobilePerformance,
        unit: "ratio",
      },
      {
        key: "performance.pagespeed.mobile.lcp_ms",
        value: 2_700 + (100 - audit.score) * 20,
        unit: "ms",
      },
      {
        key: "performance.pagespeed.mobile.cls",
        value: 0.08,
        unit: "ratio",
      },
      {
        key: "security.confirmed_missing_checks",
        value: 1,
        unit: "count",
      },
    ].map((metric, index) => ({
      _id: stableId(`metric:${persona.key}:${audit.key}:${index}`),
      auditId,
      auditPageId: homePageId,
      category: metric.key.startsWith("security.")
        ? AuditCategory.SECURITY
        : AuditCategory.PERFORMANCE,
      createdAt,
      ...metric,
    })),
    { ordered: true },
  );

  await AuditJobModel.findOneAndUpdate(
    { auditId },
    {
      $set: {
        auditId,
        status: AuditStatus.COMPLETED,
        priority: getEntitlements(persona.plan).auditQueuePriority,
        attempts: 1,
        maxAttempts: 3,
        runAt: startedAt,
        finishedAt: completedAt,
        createdAt,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  return auditId;
}

async function seedPersona(
  persona: DemoPersona,
  planIds: ReadonlyMap<PlanTierValue, string>,
): Promise<void> {
  const userId = stableId(`user:${persona.key}`);
  const workspaceId = stableId(`workspace:${persona.key}`);
  const websiteId = stableId(`website:${persona.key}`);
  const passwordHash = await argon2.hash(persona.password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });

  await UserModel.findOneAndUpdate(
    { email: persona.email },
    {
      $set: {
        name: persona.name,
        email: persona.email,
        passwordHash,
        role: persona.role,
        emailVerified: dateDaysAgo(30),
      },
      $setOnInsert: { _id: userId },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  await WorkspaceModel.findOneAndUpdate(
    { slug: persona.workspaceSlug },
    {
      $set: { name: persona.workspaceName, slug: persona.workspaceSlug },
      $setOnInsert: { _id: workspaceId },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  const user = await UserModel.findOne({ email: persona.email })
    .select({ _id: 1 })
    .lean()
    .exec();
  const workspace = await WorkspaceModel.findOne({
    slug: persona.workspaceSlug,
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  if (!user || !workspace)
    throw new Error(`Failed to seed ${persona.key} identity.`);

  const actualUserId = user._id.toString();
  const actualWorkspaceId = workspace._id.toString();

  await WorkspaceMemberModel.findOneAndUpdate(
    { workspaceId: actualWorkspaceId, userId: actualUserId },
    {
      $set: {
        workspaceId: actualWorkspaceId,
        userId: actualUserId,
        role: WorkspaceRole.OWNER,
      },
      $setOnInsert: { _id: stableId(`membership:${persona.key}`) },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  await WebsiteModel.findOneAndUpdate(
    { workspaceId: actualWorkspaceId, normalizedUrl: persona.normalizedUrl },
    {
      $set: {
        workspaceId: actualWorkspaceId,
        createdById: actualUserId,
        name: persona.websiteName,
        url: persona.websiteUrl,
        normalizedUrl: persona.normalizedUrl,
        isActive: true,
        lastAuditedAt: dateDaysAgo(persona.audits.at(-1)?.daysAgo ?? 1),
      },
      $setOnInsert: { _id: websiteId },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  const website = await WebsiteModel.findOne({
    workspaceId: actualWorkspaceId,
    normalizedUrl: persona.normalizedUrl,
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  if (!website) throw new Error(`Failed to seed ${persona.key} website.`);

  const actualWebsiteId = website._id.toString();
  const auditIds: string[] = [];
  for (const audit of persona.audits) {
    auditIds.push(
      await seedAudit({
        persona,
        userId: actualUserId,
        workspaceId: actualWorkspaceId,
        websiteId: actualWebsiteId,
        audit,
      }),
    );
  }

  const latestAuditId = auditIds.at(-1);
  if (!latestAuditId) throw new Error(`Failed to seed ${persona.key} audit.`);

  const reportId = stableId(`report:${persona.key}`);
  const generatedAt = dateDaysAgo(persona.audits.at(-1)?.daysAgo ?? 1, 11);
  await ReportModel.findOneAndUpdate(
    { _id: reportId },
    {
      $set: {
        workspaceId: actualWorkspaceId,
        auditId: latestAuditId,
        createdById: actualUserId,
        title: `${persona.websiteName} audit report`,
        format: "PDF",
        status: ReportGenerationStatus.COMPLETED,
        fileName: `${persona.key}-demo-audit-report.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 148_000,
        checksumSha256: createHash("sha256")
          .update(`${SEED_NAMESPACE}:report:${persona.key}`)
          .digest("hex"),
        generatedAt,
        createdAt: generatedAt,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();

  const latestAudit = persona.audits.at(-1);
  await Promise.all(
    [
      {
        key: "audit-completed",
        type: NotificationType.AUDIT_COMPLETED,
        title: "Audit completed",
        message: `${persona.websiteName} finished with a score of ${latestAudit?.score ?? 0}.`,
        href: `/dashboard/audits/${latestAuditId}`,
        readAt: undefined,
      },
      {
        key: "report-ready",
        type: NotificationType.REPORT_READY,
        title: "Report ready",
        message: `The PDF report for ${persona.websiteName} is ready.`,
        href: `/dashboard/audits/${latestAuditId}`,
        readAt: generatedAt,
      },
    ].map((notification) =>
      NotificationModel.findOneAndUpdate(
        {
          userId: actualUserId,
          dedupeKey: `${SEED_NAMESPACE}:${persona.key}:${notification.key}`,
        },
        {
          $set: {
            userId: actualUserId,
            workspaceId: actualWorkspaceId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            href: notification.href,
            dedupeKey: `${SEED_NAMESPACE}:${persona.key}:${notification.key}`,
            data: { auditId: latestAuditId, reportId },
            readAt: notification.readAt,
            createdAt: generatedAt,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      ).exec(),
    ),
  );

  if (persona.plan !== PlanTier.FREE) {
    const planId = planIds.get(persona.plan);
    if (!planId) throw new Error(`Missing ${persona.plan} development plan.`);
    const currentPeriodStart = dateDaysAgo(10);
    const currentPeriodEnd = new Date(
      currentPeriodStart.getTime() + 30 * DAY_MS,
    );
    await SubscriptionModel.findOneAndUpdate(
      { workspaceId: actualWorkspaceId },
      {
        $set: {
          workspaceId: actualWorkspaceId,
          planId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
        },
        $setOnInsert: { _id: stableId(`subscription:${persona.key}`) },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).exec();
  } else {
    await SubscriptionModel.deleteOne({
      workspaceId: actualWorkspaceId,
    }).exec();
  }
}

async function seedDevelopmentData(): Promise<void> {
  parseDevelopmentSeedEnvironment(process.env);
  await connectToDatabase();

  await removeLegacyDemoAdminFixture();
  const planIds = await seedPlans();
  for (const persona of demoPersonas) await seedPersona(persona, planIds);

  console.log(
    `Development seed complete: ${demoPersonas.length} users, ${demoPersonas.length} workspaces, ${demoPersonas.length} websites, and ${demoPersonas.reduce((total, persona) => total + persona.audits.length, 0)} completed audits are ready.`,
  );
}

seedDevelopmentData()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Development seed failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
