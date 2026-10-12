import { createHash, randomBytes } from "node:crypto";

import { type ClientSession, Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  PUBLIC_AUDIT_WORKSPACE_ID,
  PUBLIC_AUDIT_WORKSPACE_SLUG,
} from "../system-workspace.js";
import {
  AuditScoreCategory,
  AuditStatus,
  AuditType,
  FindingSeverity,
  type AuditScoreCategory as AuditScoreCategoryValue,
  type AuditStatus as AuditStatusValue,
  type FindingSeverity as FindingSeverityValue,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditJobModel,
  AuditModel,
  AuditScoreModel,
  PublicAuditRateLimitModel,
  PublicAuditRequestModel,
  WebsiteModel,
  WorkspaceModel,
} from "../models.js";
import {
  getPdfAuditReportForWorkspace,
  type PdfAuditReportLookup,
} from "./pdf-reports.js";

const publicWorkspaceId = new Types.ObjectId(PUBLIC_AUDIT_WORKSPACE_ID);
const publicResultLifetimeMs = 48 * 60 * 60_000;
const publicTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const activeStatuses = [
  AuditStatus.QUEUED,
  AuditStatus.INITIALIZING,
  AuditStatus.CRAWLING,
  AuditStatus.ANALYZING,
  AuditStatus.SCORING,
  AuditStatus.GENERATING_REPORT,
] as const;

const publicScoreCategories = [
  AuditScoreCategory.OVERALL,
  AuditScoreCategory.SEO,
  AuditScoreCategory.PERFORMANCE,
  AuditScoreCategory.ACCESSIBILITY,
  AuditScoreCategory.SECURITY,
] as const;

const severityRank: Readonly<Record<FindingSeverityValue, number>> = {
  CRITICAL: 3,
  WARNING: 2,
  RECOMMENDATION: 1,
  PASSED: 0,
};

type RateLimitScope =
  | "GLOBAL_MINUTE"
  | "CLIENT_HOUR"
  | "CLIENT_DAY"
  | "TARGET_DAY"
  | "STATUS_GLOBAL_MINUTE"
  | "STATUS_CLIENT_MINUTE"
  | "LEAD_GLOBAL_MINUTE"
  | "LEAD_CLIENT_HOUR"
  | "LEAD_EMAIL_DAY"
  | "LEAD_AUDIT_DAY";

type RateLimitRule = {
  scope: RateLimitScope;
  keyHash: string;
  windowMs: number;
  limit: number;
};

export class PublicAuditRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many free audit requests. Please try again later.");
    this.name = "PublicAuditRateLimitError";
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export class PublicAuditCapacityError extends Error {
  readonly retryAfterSeconds = 300;

  constructor() {
    super("Free audit capacity is currently full. Please try again shortly.");
    this.name = "PublicAuditCapacityError";
  }
}

export type PublicAuditScoreRecord = {
  category: AuditScoreCategoryValue;
  score: number | null;
  evaluated: boolean;
};

export type PublicAuditIssueRecord = {
  category: string;
  severity: Exclude<FindingSeverityValue, "PASSED">;
  title: string;
  recommendation: string;
  affectedPageCount: number;
};

export type PublicAuditViewRecord = {
  token: string;
  website: { url: string; hostname: string };
  status: AuditStatusValue;
  currentStage: AuditStatusValue;
  progress: number;
  message: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  scores: PublicAuditScoreRecord[];
  topIssues: PublicAuditIssueRecord[];
  expiresAt: Date;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function duplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function transactionIsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Transaction numbers are only allowed") ||
      error.message.includes("does not support retryable writes"))
  );
}

async function consumeRateLimitRule(
  rule: RateLimitRule,
  now: Date,
): Promise<void> {
  const windowStartMs =
    Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + rule.windowMs + 60_000);

  try {
    const record = await PublicAuditRateLimitModel.findOneAndUpdate(
      {
        scope: rule.scope,
        keyHash: rule.keyHash,
        windowStart,
        count: { $lt: rule.limit },
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    )
      .select({ count: 1 })
      .lean()
      .exec();
    if (record) return;
  } catch (error) {
    if (!duplicateKeyError(error)) throw error;
  }

  throw new PublicAuditRateLimitError(
    Math.ceil((windowStartMs + rule.windowMs - now.getTime()) / 1_000),
  );
}

/** Uses atomic MongoDB counters so limits hold across web server instances. */
export async function consumePublicAuditRateLimits(input: {
  clientKeyHash: string;
  targetHash: string;
  now?: Date;
}): Promise<void> {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const rules: readonly RateLimitRule[] = [
    {
      scope: "GLOBAL_MINUTE",
      keyHash: "global",
      windowMs: 60_000,
      limit: 20,
    },
    {
      scope: "CLIENT_HOUR",
      keyHash: input.clientKeyHash,
      windowMs: 60 * 60_000,
      limit: 3,
    },
    {
      scope: "CLIENT_DAY",
      keyHash: input.clientKeyHash,
      windowMs: 24 * 60 * 60_000,
      limit: 10,
    },
    {
      scope: "TARGET_DAY",
      keyHash: input.targetHash,
      windowMs: 24 * 60 * 60_000,
      limit: 5,
    },
  ];

  for (const rule of rules) await consumeRateLimitRule(rule, now);
}

/** Separately bounds anonymous token lookups while permitting normal polling. */
export async function consumePublicAuditStatusRateLimits(input: {
  clientKeyHash: string;
  now?: Date;
}): Promise<void> {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const rules: readonly RateLimitRule[] = [
    {
      scope: "STATUS_GLOBAL_MINUTE",
      keyHash: "global",
      windowMs: 60_000,
      limit: 600,
    },
    {
      scope: "STATUS_CLIENT_MINUTE",
      keyHash: input.clientKeyHash,
      windowMs: 60_000,
      limit: 60,
    },
  ];
  for (const rule of rules) await consumeRateLimitRule(rule, now);
}

/** Bounds anonymous lead submissions by deployment, client, email, and audit. */
export async function consumePublicLeadRateLimits(input: {
  clientKeyHash: string;
  emailKeyHash: string;
  auditKeyHash: string;
  now?: Date;
}): Promise<void> {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const rules: readonly RateLimitRule[] = [
    {
      scope: "LEAD_GLOBAL_MINUTE",
      keyHash: "global",
      windowMs: 60_000,
      limit: 30,
    },
    {
      scope: "LEAD_CLIENT_HOUR",
      keyHash: input.clientKeyHash,
      windowMs: 60 * 60_000,
      limit: 5,
    },
    {
      scope: "LEAD_EMAIL_DAY",
      keyHash: input.emailKeyHash,
      windowMs: 24 * 60 * 60_000,
      limit: 5,
    },
    {
      scope: "LEAD_AUDIT_DAY",
      keyHash: input.auditKeyHash,
      windowMs: 24 * 60 * 60_000,
      limit: 10,
    },
  ];
  for (const rule of rules) await consumeRateLimitRule(rule, now);
}

async function ensurePublicWebsite(input: {
  targetUrl: string;
  normalizedUrl: string;
  expiresAt: Date;
}) {
  await WorkspaceModel.updateOne(
    { _id: publicWorkspaceId },
    {
      $setOnInsert: {
        name: "SiteSignal public audits",
        slug: PUBLIC_AUDIT_WORKSPACE_SLUG,
      },
    },
    { upsert: true },
  ).exec();

  const hostname = new URL(input.targetUrl).hostname;
  try {
    return await WebsiteModel.findOneAndUpdate(
      { workspaceId: publicWorkspaceId, normalizedUrl: input.normalizedUrl },
      {
        $set: {
          name: hostname,
          url: input.targetUrl,
          isActive: true,
          expiresAt: input.expiresAt,
        },
        $setOnInsert: { workspaceId: publicWorkspaceId },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).exec();
  } catch (error) {
    if (!duplicateKeyError(error)) throw error;
    return WebsiteModel.findOne({
      workspaceId: publicWorkspaceId,
      normalizedUrl: input.normalizedUrl,
    }).exec();
  }
}

type PublicAuditCreationInput = {
  targetUrl: string;
  normalizedUrl: string;
  clientKeyHash: string;
  targetHash: string;
};

async function createPublicRecords(
  input: PublicAuditCreationInput,
  token: string,
  expiresAt: Date,
  auditId: Types.ObjectId,
  websiteId: Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const auditData = {
    _id: auditId,
    workspaceId: publicWorkspaceId,
    websiteId,
    type: AuditType.QUICK,
    status: AuditStatus.QUEUED,
    progress: 0,
    currentStage: AuditStatus.QUEUED,
    pagesDiscovered: 0,
    pagesCrawled: 0,
    statusMessage: "Waiting for a free audit worker.",
    configuration: {
      publicAudit: true,
      preset: "QUICK",
      maximumPages: 5,
      maximumDepth: 1,
      respectRobotsTxt: true,
      checkExternalLinks: false,
      javascriptRendering: false,
      performanceAnalysis: true,
      accessibilityAnalysis: true,
      securityAnalysis: true,
      mobileAnalysis: false,
    },
    expiresAt,
  };
  const jobData = {
    auditId,
    status: AuditStatus.QUEUED,
    priority: -10,
    maxAttempts: 2,
    runAt: new Date(),
    expiresAt,
  };
  const requestData = {
    auditId,
    websiteId,
    publicTokenHash: tokenHash(token),
    clientKeyHash: input.clientKeyHash,
    targetHash: input.targetHash,
    targetUrl: input.targetUrl,
    normalizedUrl: input.normalizedUrl,
    expiresAt,
  };

  if (session) {
    await AuditModel.create([auditData], { session });
    await AuditJobModel.create([jobData], { session });
    await PublicAuditRequestModel.create([requestData], { session });
    return;
  }

  try {
    await AuditModel.create(auditData);
    await AuditJobModel.create(jobData);
    await PublicAuditRequestModel.create(requestData);
  } catch (error) {
    await Promise.allSettled([
      PublicAuditRequestModel.deleteOne({ auditId }),
      AuditJobModel.deleteOne({ auditId }),
      AuditModel.deleteOne({ _id: auditId }),
    ]);
    throw error;
  }
}

export async function enqueuePublicAudit(
  input: PublicAuditCreationInput,
): Promise<{ auditId: string; token: string; expiresAt: Date }> {
  const mongo = await connectToDatabase();
  const activeCount = await AuditModel.countDocuments({
    workspaceId: publicWorkspaceId,
    status: { $in: activeStatuses },
  }).exec();
  if (activeCount >= 25) throw new PublicAuditCapacityError();

  const expiresAt = new Date(Date.now() + publicResultLifetimeMs);
  const website = await ensurePublicWebsite({
    targetUrl: input.targetUrl,
    normalizedUrl: input.normalizedUrl,
    expiresAt,
  });
  if (!website) throw new Error("The public audit target could not be stored.");

  const token = randomBytes(32).toString("base64url");
  const auditId = new Types.ObjectId();
  const session = await mongo.connection.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await createPublicRecords(
          input,
          token,
          expiresAt,
          auditId,
          website._id,
          session,
        );
      });
    } catch (error) {
      if (!transactionIsUnavailable(error)) throw error;
      await createPublicRecords(input, token, expiresAt, auditId, website._id);
    }
  } finally {
    await session.endSession();
  }
  return { auditId: auditId.toString(), token, expiresAt };
}

export async function getPublicAuditTarget(
  auditId: string,
): Promise<{ url: string; name: string } | null> {
  if (!Types.ObjectId.isValid(auditId)) return null;
  await connectToDatabase();
  const request = await PublicAuditRequestModel.findOne({
    auditId,
    expiresAt: { $gt: new Date() },
  })
    .select({ targetUrl: 1 })
    .lean()
    .exec();
  if (!request) return null;
  const url = new URL(request.targetUrl);
  return { url: request.targetUrl, name: url.hostname };
}

export async function getPublicAuditByToken(
  token: string,
): Promise<PublicAuditViewRecord | null> {
  if (!publicTokenPattern.test(token)) return null;
  await connectToDatabase();
  const request = await PublicAuditRequestModel.findOne({
    publicTokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();
  if (!request) return null;

  const audit = await AuditModel.findOne({
    _id: request.auditId,
    workspaceId: publicWorkspaceId,
  })
    .select({
      status: 1,
      currentStage: 1,
      progress: 1,
      statusMessage: 1,
      pagesDiscovered: 1,
      pagesCrawled: 1,
    })
    .lean()
    .exec();
  if (!audit) return null;

  const completed = audit.status === AuditStatus.COMPLETED;
  const [scores, findings] = completed
    ? await Promise.all([
        AuditScoreModel.find({
          auditId: audit._id,
          category: { $in: publicScoreCategories },
        })
          .select({ category: 1, score: 1, evaluated: 1 })
          .lean()
          .exec(),
        AuditFindingModel.find({
          auditId: audit._id,
          severity: { $ne: FindingSeverity.PASSED },
        })
          .select({
            category: 1,
            severity: 1,
            ruleCode: 1,
            title: 1,
            recommendation: 1,
            scoreImpact: 1,
            affectedPageCount: 1,
          })
          .sort({ scoreImpact: -1, ruleCode: 1 })
          .limit(250)
          .lean()
          .exec(),
      ])
    : [[], []];

  const groupedIssues = new Map<
    string,
    PublicAuditIssueRecord & { scoreImpact: number }
  >();
  for (const finding of findings) {
    const severity = finding.severity as FindingSeverityValue;
    if (severity === FindingSeverity.PASSED) continue;
    const existing = groupedIssues.get(finding.ruleCode);
    const candidate = {
      category: finding.category,
      severity: severity as Exclude<FindingSeverityValue, "PASSED">,
      title: finding.title,
      recommendation: finding.recommendation,
      affectedPageCount: Math.max(1, finding.affectedPageCount ?? 1),
      scoreImpact: finding.scoreImpact,
    } satisfies PublicAuditIssueRecord & { scoreImpact: number };
    if (
      !existing ||
      severityRank[candidate.severity] > severityRank[existing.severity] ||
      candidate.scoreImpact > existing.scoreImpact
    ) {
      groupedIssues.set(finding.ruleCode, candidate);
    } else {
      existing.affectedPageCount = Math.max(
        existing.affectedPageCount,
        candidate.affectedPageCount,
      );
    }
  }
  const topIssues = [...groupedIssues.values()]
    .sort(
      (left, right) =>
        severityRank[right.severity] - severityRank[left.severity] ||
        right.scoreImpact - left.scoreImpact ||
        left.title.localeCompare(right.title),
    )
    .slice(0, 5)
    .map((issue) => ({
      category: issue.category,
      severity: issue.severity,
      title: issue.title,
      recommendation: issue.recommendation,
      affectedPageCount: issue.affectedPageCount,
    }));

  return {
    token,
    website: {
      url: request.targetUrl,
      hostname: new URL(request.targetUrl).hostname,
    },
    status: audit.status,
    currentStage: audit.currentStage ?? audit.status,
    progress: audit.progress,
    message:
      audit.status === AuditStatus.FAILED
        ? "The free audit could not be completed. Please try again later."
        : audit.statusMessage,
    pagesDiscovered: audit.pagesDiscovered ?? 0,
    pagesCrawled: audit.pagesCrawled ?? 0,
    scores: publicScoreCategories.map((category) => {
      const score = scores.find((item) => item.category === category);
      return {
        category,
        score: score?.evaluated ? score.score : null,
        evaluated: score?.evaluated === true,
      };
    }),
    topIssues,
    expiresAt: request.expiresAt,
  };
}

/** A short-lived bearer token grants report access only for its own public audit. */
export async function getPublicPdfReportByToken(token: string): Promise<
  | Exclude<PdfAuditReportLookup, { outcome: "ready" }>
  | (Extract<PdfAuditReportLookup, { outcome: "ready" }> & {
      workspaceId: string;
    })
> {
  if (!publicTokenPattern.test(token)) return { outcome: "not_found" };
  await connectToDatabase();
  const request = await PublicAuditRequestModel.findOne({
    publicTokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  })
    .select({ auditId: 1 })
    .lean()
    .exec();
  if (!request) return { outcome: "not_found" };
  const result = await getPdfAuditReportForWorkspace({
    workspaceId: publicWorkspaceId.toString(),
    auditId: request.auditId.toString(),
  });
  return result.outcome === "ready"
    ? { ...result, workspaceId: publicWorkspaceId.toString() }
    : result;
}

export async function getPublicAuditLeadContext(token: string): Promise<{
  auditId: string;
  websiteUrl: string;
  auditScore: number | null;
  topDetectedProblems: PublicAuditIssueRecord[];
} | null> {
  const audit = await getPublicAuditByToken(token);
  if (!audit || audit.status !== AuditStatus.COMPLETED) return null;

  const request = await PublicAuditRequestModel.findOne({
    publicTokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  })
    .select({ auditId: 1 })
    .lean()
    .exec();
  if (!request) return null;

  const overall = audit.scores.find(
    (score) => score.category === AuditScoreCategory.OVERALL,
  );
  return {
    auditId: request.auditId.toString(),
    websiteUrl: audit.website.url,
    auditScore: overall?.evaluated ? overall.score : null,
    topDetectedProblems: audit.topIssues,
  };
}
