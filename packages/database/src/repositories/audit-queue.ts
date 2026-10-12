import { randomUUID } from "node:crypto";
import { type ClientSession, Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import { getMaxCrawlPages } from "@website-audit/shared";
import {
  AuditStatus,
  AuditType,
  type AuditStatus as AuditState,
} from "../enums.js";
import { AuditJobModel, AuditModel, WebsiteModel } from "../models.js";
import { getPublicAuditTarget } from "./public-audits.js";
import { getWorkspaceEntitlements } from "./entitlements.js";
import {
  createAuditCompletionNotifications,
  createAuditFailureNotification,
} from "./notifications.js";
import { settleAuditPageUsage } from "./usage.js";
import { databaseLogger } from "../logger.js";

const terminalAuditStatuses: readonly AuditState[] = [
  AuditStatus.COMPLETED,
  AuditStatus.FAILED,
  AuditStatus.CANCELLED,
];

const activeAuditStatuses: readonly AuditState[] = [
  AuditStatus.INITIALIZING,
  AuditStatus.CRAWLING,
  AuditStatus.ANALYZING,
  AuditStatus.SCORING,
  AuditStatus.GENERATING_REPORT,
];

const pipelineSteps = new Set([
  "URL_VALIDATION",
  "ROBOTS_AND_SITEMAPS",
  "CRAWLING",
  "SEO",
  "TECHNICAL",
  "ACCESSIBILITY",
  "SECURITY",
  "PERFORMANCE",
  "MOBILE",
  "SCORING",
  "PERSISTING",
  "FINALIZING",
]);

export class WebsiteNotAvailableForAuditError extends Error {
  constructor() {
    super("The website is unavailable or archived.");
    this.name = "WebsiteNotAvailableForAuditError";
  }
}

export type EnqueueAuditInput = {
  workspaceId: string;
  websiteId: string;
  requestedById: string;
  type?: (typeof AuditType)[keyof typeof AuditType];
  configuration?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  usagePageReservation?: number;
  usagePeriodStart?: Date;
  usagePeriodEnd?: Date;
};

export type EnqueuedAudit = {
  auditId: string;
  status: typeof AuditStatus.QUEUED;
  progress: number;
};

export type AuditJobStatusRecord = {
  auditId: string;
  websiteId: string;
  status: AuditState;
  progress: number;
  currentStage: AuditState;
  pagesDiscovered: number;
  pagesCrawled: number;
  message: string;
  attempts: number;
  maxAttempts: number;
  failureReason: string | null;
  failureCode: string | null;
  failureStage: AuditState | null;
  failureStep: string | null;
  runAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClaimedAuditJob = {
  auditId: string;
  jobId: string;
  attempt: number;
  maxAttempts: number;
};

export type ClaimedAuditContext = ClaimedAuditJob & {
  workspaceId: string;
  websiteId: string;
  websiteName: string;
  websiteUrl: string;
  auditType: (typeof AuditType)[keyof typeof AuditType];
  configuration: Record<string, unknown> | null;
};

function transactionIsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Transaction numbers are only allowed") ||
      error.message.includes("does not support retryable writes"))
  );
}

async function assertWebsiteAvailable(
  input: EnqueueAuditInput,
  session?: ClientSession,
): Promise<void> {
  let query = WebsiteModel.exists({
    _id: input.websiteId,
    workspaceId: input.workspaceId,
    isActive: true,
  });

  if (session) query = query.session(session);
  if (!(await query)) throw new WebsiteNotAvailableForAuditError();
}

async function createQueuedRecords(
  input: EnqueueAuditInput,
  session: ClientSession,
): Promise<EnqueuedAudit> {
  await assertWebsiteAvailable(input, session);
  const [audit] = await AuditModel.create(
    [
      {
        workspaceId: input.workspaceId,
        websiteId: input.websiteId,
        requestedById: input.requestedById,
        type: input.type ?? AuditType.STANDARD,
        status: AuditStatus.QUEUED,
        progress: 0,
        currentStage: AuditStatus.QUEUED,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        usagePageReservation: input.usagePageReservation ?? 0,
        usagePeriodStart: input.usagePeriodStart,
        usagePeriodEnd: input.usagePeriodEnd,
        statusMessage: "Waiting for an audit worker.",
        configuration: input.configuration,
      },
    ],
    { session },
  );

  if (!audit)
    throw new Error("MongoDB did not return the queued audit record.");

  await AuditJobModel.create(
    [
      {
        auditId: audit._id,
        status: AuditStatus.QUEUED,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? 3,
        runAt: new Date(),
      },
    ],
    { session },
  );

  return {
    auditId: audit._id.toString(),
    status: AuditStatus.QUEUED,
    progress: 0,
  };
}

async function createQueuedRecordsWithCompensation(
  input: EnqueueAuditInput,
): Promise<EnqueuedAudit> {
  await assertWebsiteAvailable(input);
  const audit = await AuditModel.create({
    workspaceId: input.workspaceId,
    websiteId: input.websiteId,
    requestedById: input.requestedById,
    type: input.type ?? AuditType.STANDARD,
    status: AuditStatus.QUEUED,
    progress: 0,
    currentStage: AuditStatus.QUEUED,
    pagesDiscovered: 0,
    pagesCrawled: 0,
    usagePageReservation: input.usagePageReservation ?? 0,
    usagePeriodStart: input.usagePeriodStart,
    usagePeriodEnd: input.usagePeriodEnd,
    statusMessage: "Waiting for an audit worker.",
    configuration: input.configuration,
  });

  try {
    await AuditJobModel.create({
      auditId: audit._id,
      status: AuditStatus.QUEUED,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: new Date(),
    });
  } catch (error) {
    await AuditModel.deleteOne({ _id: audit._id });
    throw error;
  }

  return {
    auditId: audit._id.toString(),
    status: AuditStatus.QUEUED,
    progress: 0,
  };
}

/** Creates the authoritative audit and a queue record containing only auditId. */
export async function enqueueAudit(
  input: EnqueueAuditInput,
): Promise<EnqueuedAudit> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.websiteId) ||
    !Types.ObjectId.isValid(input.requestedById)
  ) {
    throw new WebsiteNotAvailableForAuditError();
  }

  const mongo = await connectToDatabase();
  const session = await mongo.connection.startSession();
  let result: EnqueuedAudit | undefined;

  try {
    try {
      await session.withTransaction(async () => {
        result = await createQueuedRecords(input, session);
      });
    } catch (error) {
      if (!transactionIsUnavailable(error)) throw error;
      return await createQueuedRecordsWithCompensation(input);
    }

    if (!result)
      throw new Error("Audit transaction completed without a result.");
    return result;
  } finally {
    await session.endSession();
  }
}

export async function getAuditJobStatus(input: {
  auditId: string;
  workspaceId: string;
}): Promise<AuditJobStatusRecord | null> {
  if (!Types.ObjectId.isValid(input.auditId)) return null;
  await connectToDatabase();

  const audit = await AuditModel.findOne({
    _id: input.auditId,
    workspaceId: input.workspaceId,
  })
    .lean()
    .exec();
  if (!audit) return null;

  const job = await AuditJobModel.findOne({ auditId: audit._id }).lean().exec();
  if (!job) return null;

  return {
    auditId: audit._id.toString(),
    websiteId: audit.websiteId.toString(),
    status: audit.status,
    progress: audit.progress,
    currentStage: audit.currentStage ?? audit.status,
    pagesDiscovered: audit.pagesDiscovered ?? 0,
    pagesCrawled: audit.pagesCrawled ?? 0,
    message:
      audit.statusMessage ??
      (audit.status === AuditStatus.COMPLETED
        ? "Audit lifecycle completed."
        : "Audit status is available."),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    failureReason: audit.failureReason ?? null,
    failureCode: audit.failureCode ?? null,
    failureStage: audit.failureStage ?? null,
    failureStep: audit.failureStep ?? null,
    runAt: job.runAt,
    startedAt: audit.startedAt ?? null,
    completedAt: audit.completedAt ?? null,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  };
}

export type CancelAuditResult =
  | { outcome: "not_found" }
  | { outcome: "cancelled"; status: typeof AuditStatus.CANCELLED }
  | { outcome: "unchanged"; status: AuditState };

export async function cancelAudit(input: {
  auditId: string;
  workspaceId: string;
}): Promise<CancelAuditResult> {
  if (!Types.ObjectId.isValid(input.auditId)) return { outcome: "not_found" };
  await connectToDatabase();

  const audit = await AuditModel.findOne({
    _id: input.auditId,
    workspaceId: input.workspaceId,
  })
    .select({ status: 1 })
    .lean()
    .exec();
  if (!audit) return { outcome: "not_found" };
  if (terminalAuditStatuses.includes(audit.status)) {
    return { outcome: "unchanged", status: audit.status };
  }

  await settleAuditPageUsage(input.auditId);
  const now = new Date();
  const cancelled = await AuditModel.findOneAndUpdate(
    {
      _id: audit._id,
      workspaceId: input.workspaceId,
      status: { $nin: terminalAuditStatuses },
    },
    {
      $set: {
        status: AuditStatus.CANCELLED,
        currentStage: AuditStatus.CANCELLED,
        statusMessage: "Audit cancelled.",
        completedAt: now,
      },
      $unset: {
        failureReason: 1,
        failureCode: 1,
        failureStage: 1,
        failureStep: 1,
      },
    },
    { returnDocument: "after" },
  )
    .select({ status: 1 })
    .lean()
    .exec();

  if (!cancelled) {
    const latest = await AuditModel.findById(audit._id)
      .select({ status: 1 })
      .lean()
      .exec();
    return latest
      ? { outcome: "unchanged", status: latest.status }
      : { outcome: "not_found" };
  }

  await AuditJobModel.updateOne(
    { auditId: audit._id, status: { $nin: terminalAuditStatuses } },
    {
      $set: { status: AuditStatus.CANCELLED, finishedAt: now },
      $unset: { lockedAt: 1, lockedBy: 1 },
    },
  ).exec();

  return { outcome: "cancelled", status: AuditStatus.CANCELLED };
}

export async function claimNextAuditJob(
  workerId: string,
): Promise<ClaimedAuditJob | null> {
  await connectToDatabase();
  const now = new Date();
  const job = await AuditJobModel.findOneAndUpdate(
    { status: AuditStatus.QUEUED, runAt: { $lte: now } },
    {
      $set: {
        status: AuditStatus.INITIALIZING,
        lockedAt: now,
        lockedBy: workerId,
      },
      $unset: { finishedAt: 1 },
      $inc: { attempts: 1 },
    },
    {
      sort: { priority: -1, runAt: 1, createdAt: 1 },
      returnDocument: "after",
    },
  )
    .lean()
    .exec();
  if (!job) return null;

  const audit = await AuditModel.findOneAndUpdate(
    { _id: job.auditId, status: AuditStatus.QUEUED },
    {
      $set: {
        status: AuditStatus.INITIALIZING,
        progress: 1,
        currentStage: AuditStatus.INITIALIZING,
        statusMessage: "Preparing the audit.",
      },
      $min: { startedAt: now },
      $unset: {
        failureReason: 1,
        failureCode: 1,
        failureStage: 1,
        failureStep: 1,
        completedAt: 1,
      },
    },
    { returnDocument: "after" },
  )
    .select({ _id: 1 })
    .lean()
    .exec();

  if (!audit) {
    const authoritativeAudit = await AuditModel.findById(job.auditId)
      .select({ status: 1 })
      .lean()
      .exec();
    const synchronizedStatus =
      authoritativeAudit &&
      terminalAuditStatuses.includes(authoritativeAudit.status)
        ? authoritativeAudit.status
        : AuditStatus.FAILED;
    await AuditJobModel.updateOne(
      { _id: job._id, lockedBy: workerId },
      {
        $set: { status: synchronizedStatus, finishedAt: now },
        $unset: { lockedAt: 1, lockedBy: 1 },
      },
    ).exec();
    return null;
  }

  return {
    auditId: job.auditId.toString(),
    jobId: job._id.toString(),
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
  };
}

export async function loadClaimedAuditContext(
  claim: ClaimedAuditJob,
  workerId: string,
): Promise<ClaimedAuditContext | null> {
  await connectToDatabase();
  const job = await AuditJobModel.exists({
    _id: claim.jobId,
    auditId: claim.auditId,
    status: AuditStatus.INITIALIZING,
    lockedBy: workerId,
  });
  if (!job) return null;

  const audit = await AuditModel.findOne({
    _id: claim.auditId,
    status: AuditStatus.INITIALIZING,
  })
    .lean()
    .exec();
  if (!audit) return null;

  const website = await WebsiteModel.findOne({
    _id: audit.websiteId,
    workspaceId: audit.workspaceId,
  })
    .select({ name: 1, url: 1 })
    .lean()
    .exec();
  if (!website) return null;

  const storedConfiguration =
    audit.configuration && typeof audit.configuration === "object"
      ? (audit.configuration as Record<string, unknown>)
      : null;
  const publicAudit = storedConfiguration?.publicAudit === true;
  const publicTarget = publicAudit
    ? await getPublicAuditTarget(audit._id.toString())
    : null;
  if (publicAudit && !publicTarget) return null;
  const workspacePlan = publicAudit
    ? null
    : await getWorkspaceEntitlements(audit.workspaceId.toString());
  const configuration = workspacePlan
    ? {
        ...(storedConfiguration ?? {}),
        entitlementMaximumPages: getMaxCrawlPages(workspacePlan.entitlements),
      }
    : storedConfiguration;

  return {
    ...claim,
    workspaceId: audit.workspaceId.toString(),
    websiteId: audit.websiteId.toString(),
    websiteName: publicTarget?.name ?? website.name?.trim() ?? website.url,
    websiteUrl: publicTarget?.url ?? website.url,
    auditType: audit.type,
    configuration,
  };
}

export async function updateAuditJobProgress(input: {
  auditId: string;
  workerId: string;
  progress: number;
  currentStage: AuditState;
  pagesDiscovered: number;
  pagesCrawled: number;
  message: string;
}): Promise<boolean> {
  await connectToDatabase();
  if (!activeAuditStatuses.includes(input.currentStage)) return false;
  const progress = Math.max(1, Math.min(99, Math.round(input.progress)));
  const heartbeat = await AuditJobModel.updateOne(
    {
      auditId: input.auditId,
      status: AuditStatus.INITIALIZING,
      lockedBy: input.workerId,
    },
    { $set: { lockedAt: new Date() } },
  ).exec();
  if (heartbeat.matchedCount !== 1) return false;

  const audit = await AuditModel.updateOne(
    {
      _id: input.auditId,
      status: { $in: activeAuditStatuses },
      progress: { $lte: progress },
    },
    {
      $set: {
        status: input.currentStage,
        currentStage: input.currentStage,
        statusMessage: input.message.slice(0, 500),
      },
      $max: {
        progress,
        pagesDiscovered: Math.max(0, Math.floor(input.pagesDiscovered)),
        pagesCrawled: Math.max(0, Math.floor(input.pagesCrawled)),
      },
    },
  ).exec();
  return audit.matchedCount === 1;
}

/** Keeps a legitimately running job from being reclaimed during a long stage. */
export async function renewAuditJobLease(input: {
  auditId: string;
  jobId: string;
  workerId: string;
}): Promise<boolean> {
  await connectToDatabase();
  const result = await AuditJobModel.updateOne(
    {
      _id: input.jobId,
      auditId: input.auditId,
      status: AuditStatus.INITIALIZING,
      lockedBy: input.workerId,
    },
    { $set: { lockedAt: new Date() } },
  ).exec();
  return result.matchedCount === 1;
}

export async function completeAuditJob(input: {
  auditId: string;
  workerId: string;
}): Promise<boolean> {
  await connectToDatabase();
  const now = new Date();
  const ownsLease = await AuditJobModel.exists({
    auditId: input.auditId,
    status: AuditStatus.INITIALIZING,
    lockedBy: input.workerId,
  });
  if (!ownsLease) return false;

  await settleAuditPageUsage(input.auditId);

  let audit = await AuditModel.findOne({
    _id: input.auditId,
    status: AuditStatus.COMPLETED,
  })
    .select({ websiteId: 1 })
    .lean()
    .exec();
  audit ??= await AuditModel.findOneAndUpdate(
    { _id: input.auditId, status: { $in: activeAuditStatuses } },
    {
      $set: {
        status: AuditStatus.COMPLETED,
        progress: 100,
        currentStage: AuditStatus.COMPLETED,
        statusMessage: "Audit completed successfully.",
        completedAt: now,
      },
      $unset: {
        failureReason: 1,
        failureCode: 1,
        failureStage: 1,
        failureStep: 1,
      },
    },
    { returnDocument: "after" },
  )
    .select({ websiteId: 1 })
    .lean()
    .exec();
  if (!audit) return false;

  const job = await AuditJobModel.updateOne(
    {
      auditId: audit._id,
      status: AuditStatus.INITIALIZING,
      lockedBy: input.workerId,
    },
    {
      $set: { status: AuditStatus.COMPLETED, finishedAt: now },
      $unset: { lockedAt: 1, lockedBy: 1, lastError: 1 },
    },
  ).exec();

  if (job.matchedCount !== 1) return false;
  await WebsiteModel.updateOne(
    { _id: audit.websiteId },
    { $set: { lastAuditedAt: now } },
  ).exec();
  try {
    await createAuditCompletionNotifications(audit._id.toString());
  } catch (error) {
    databaseLogger("error", "notification.audit_completion_failed", {
      auditId: audit._id.toString(),
      error,
    });
  }
  return true;
}

export type FailAuditJobResult = "retried" | "failed" | "ignored";

export async function failAuditJob(input: {
  auditId: string;
  workerId: string;
  failureCode: string;
  failureStage: AuditState;
  failureStep?: string;
  safeError: string;
  retryable: boolean;
  retryDelayMs: number;
}): Promise<FailAuditJobResult> {
  await connectToDatabase();
  const job = await AuditJobModel.findOne({
    auditId: input.auditId,
    status: AuditStatus.INITIALIZING,
    lockedBy: input.workerId,
  })
    .select({ attempts: 1, maxAttempts: 1 })
    .lean()
    .exec();
  if (!job) return "ignored";

  const shouldRetry = input.retryable && job.attempts < job.maxAttempts;
  const failureCode =
    input.failureCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .slice(0, 100) || "AUDIT_PROCESSING_FAILED";
  const failureStep =
    input.failureStep && pipelineSteps.has(input.failureStep)
      ? input.failureStep
      : input.failureStage === AuditStatus.CRAWLING
        ? "CRAWLING"
        : input.failureStage === AuditStatus.SCORING
          ? "SCORING"
          : input.failureStage === AuditStatus.GENERATING_REPORT
            ? "PERSISTING"
            : "URL_VALIDATION";
  const recordedAt = new Date();
  const diagnostic = {
    engine: "PIPELINE",
    step: failureStep,
    outcome: shouldRetry ? "RETRY_SCHEDULED" : "FAILED",
    code: failureCode,
    message: input.safeError.slice(0, 500),
    recordedAt,
  } as const;
  if (shouldRetry) {
    const audit = await AuditModel.updateOne(
      { _id: input.auditId, status: { $in: activeAuditStatuses } },
      {
        $set: {
          status: AuditStatus.QUEUED,
          progress: 0,
          currentStage: AuditStatus.QUEUED,
          statusMessage: "Retry scheduled after a processing failure.",
          failureReason: input.safeError,
          failureCode,
          failureStage: input.failureStage,
          failureStep,
        },
        $push: {
          pipelineDiagnostics: { $each: [diagnostic], $slice: -50 },
        },
        $unset: { completedAt: 1 },
      },
    ).exec();
    if (audit.matchedCount !== 1) return "ignored";

    await AuditJobModel.updateOne(
      {
        _id: job._id,
        status: AuditStatus.INITIALIZING,
        lockedBy: input.workerId,
      },
      {
        $set: {
          status: AuditStatus.QUEUED,
          runAt: new Date(Date.now() + Math.max(0, input.retryDelayMs)),
          lastError: input.safeError,
        },
        $unset: { lockedAt: 1, lockedBy: 1, finishedAt: 1 },
      },
    ).exec();
    return "retried";
  }

  const now = new Date();
  await settleAuditPageUsage(input.auditId);
  const audit = await AuditModel.updateOne(
    { _id: input.auditId, status: { $in: activeAuditStatuses } },
    {
      $set: {
        status: AuditStatus.FAILED,
        currentStage: AuditStatus.FAILED,
        statusMessage: input.safeError,
        failureReason: input.safeError,
        failureCode,
        failureStage: input.failureStage,
        failureStep,
        completedAt: now,
      },
      $push: {
        pipelineDiagnostics: { $each: [diagnostic], $slice: -50 },
      },
    },
  ).exec();
  if (audit.matchedCount !== 1) return "ignored";

  await AuditJobModel.updateOne(
    {
      _id: job._id,
      status: AuditStatus.INITIALIZING,
      lockedBy: input.workerId,
    },
    {
      $set: {
        status: AuditStatus.FAILED,
        lastError: input.safeError,
        finishedAt: now,
      },
      $unset: { lockedAt: 1, lockedBy: 1 },
    },
  ).exec();
  try {
    await createAuditFailureNotification(input.auditId);
  } catch (error) {
    databaseLogger("error", "notification.audit_failure_failed", {
      auditId: input.auditId,
      error,
    });
  }
  return "failed";
}

export async function releaseAuditJobForShutdown(input: {
  auditId: string;
  workerId: string;
  attempt: number;
}): Promise<void> {
  await connectToDatabase();
  const ownsLease = await AuditJobModel.exists({
    auditId: input.auditId,
    status: AuditStatus.INITIALIZING,
    lockedBy: input.workerId,
  });
  if (!ownsLease) return;

  const audit = await AuditModel.updateOne(
    { _id: input.auditId, status: { $in: activeAuditStatuses } },
    {
      $set: {
        status: AuditStatus.QUEUED,
        progress: 0,
        currentStage: AuditStatus.QUEUED,
        statusMessage: "Waiting for an audit worker.",
      },
    },
  ).exec();
  if (audit.matchedCount !== 1) return;

  await AuditJobModel.updateOne(
    {
      auditId: input.auditId,
      status: AuditStatus.INITIALIZING,
      lockedBy: input.workerId,
    },
    {
      $set: {
        status: AuditStatus.QUEUED,
        runAt: new Date(),
        attempts: Math.max(0, input.attempt - 1),
      },
      $unset: { lockedAt: 1, lockedBy: 1, finishedAt: 1 },
    },
  ).exec();
}

export async function recoverStalledAuditJobs(input: {
  staleBefore: Date;
  retryDelayForAttempt: (attempt: number) => number;
}): Promise<number> {
  await connectToDatabase();
  const jobs = await AuditJobModel.find({
    status: AuditStatus.INITIALIZING,
    lockedAt: { $lt: input.staleBefore },
    lockedBy: { $exists: true },
  })
    .sort({ lockedAt: 1 })
    .limit(25)
    .select({ auditId: 1, lockedBy: 1, attempts: 1 })
    .lean()
    .exec();

  let recovered = 0;
  for (const job of jobs) {
    if (!job.lockedBy) continue;
    // A heartbeat may have renewed the lease after the stale-job query.
    // Atomically take ownership only if it is still stale; the old worker's
    // next heartbeat/progress write will then reject its lost lease.
    const recoveryOwner = `recovery:${randomUUID()}`;
    const reclaimed = await AuditJobModel.findOneAndUpdate(
      {
        _id: job._id,
        status: AuditStatus.INITIALIZING,
        lockedBy: job.lockedBy,
        lockedAt: { $lt: input.staleBefore },
      },
      { $set: { lockedBy: recoveryOwner, lockedAt: new Date() } },
      { returnDocument: "after" },
    )
      .select({ _id: 1 })
      .lean()
      .exec();
    if (!reclaimed) continue;

    const audit = await AuditModel.findById(job.auditId)
      .select({ status: 1 })
      .lean()
      .exec();
    if (!audit || terminalAuditStatuses.includes(audit.status)) {
      await AuditJobModel.updateOne(
        {
          _id: job._id,
          status: AuditStatus.INITIALIZING,
          lockedBy: recoveryOwner,
        },
        {
          $set: {
            status: audit?.status ?? AuditStatus.FAILED,
            finishedAt: new Date(),
            ...(!audit
              ? { lastError: "The authoritative audit record is unavailable." }
              : {}),
          },
          $unset: { lockedAt: 1, lockedBy: 1 },
        },
      ).exec();
      recovered += 1;
      continue;
    }

    if (audit.status === AuditStatus.QUEUED) {
      await AuditJobModel.updateOne(
        {
          _id: job._id,
          status: AuditStatus.INITIALIZING,
          lockedBy: recoveryOwner,
        },
        {
          $set: { status: AuditStatus.QUEUED, runAt: new Date() },
          $unset: { lockedAt: 1, lockedBy: 1, finishedAt: 1 },
        },
      ).exec();
      recovered += 1;
      continue;
    }

    const result = await failAuditJob({
      auditId: job.auditId.toString(),
      workerId: recoveryOwner,
      safeError: "The audit worker stopped before processing completed.",
      failureCode: "STALE_WORKER_LEASE",
      failureStage: audit.status,
      retryable: true,
      retryDelayMs: input.retryDelayForAttempt(job.attempts),
    });
    if (result !== "ignored") recovered += 1;
  }

  return recovered;
}
