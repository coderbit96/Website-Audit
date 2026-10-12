import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { getEntitlements, PlanTier } from "@website-audit/shared";

import {
  AuditCategory,
  AuditScoreCategory,
  AuditStatus,
  AuditType,
  FindingSeverity,
  FindingStatus,
  LeadRequestedService,
  LeadSource,
  NotificationType,
  ReportGenerationStatus,
  SubscriptionStatus,
  UsageMetric,
  UserRole,
  WorkspaceRole,
} from "./enums.js";
import {
  AUDIT_FINDING_IDENTITY_INDEX,
  AUDIT_FINDING_IDENTITY_KEYS,
  AUDIT_METRIC_IDENTITY_INDEX,
  AUDIT_METRIC_IDENTITY_KEYS,
} from "./integrity-indexes.js";

const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" } as const;
const schemaOptions = { timestamps, versionKey: false } as const;
const freePlanEntitlements = getEntitlements(PlanTier.FREE);

function getModel<T>(
  name: string,
  schema: Schema<T>,
  collection: string,
): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, collection)
  );
}

const userSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    emailVerified: Date,
    image: String,
    passwordHash: { type: String, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      required: true,
    },
  },
  schemaOptions,
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
export type User = InferSchemaType<typeof userSchema>;
export const UserModel = getModel("User", userSchema, "users");

const accountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, required: true },
    provider: { type: String, required: true },
    providerAccountId: { type: String, required: true },
    refresh_token: String,
    access_token: String,
    expires_at: Number,
    token_type: String,
    scope: String,
    id_token: String,
    session_state: String,
  },
  schemaOptions,
);
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
accountSchema.index({ userId: 1 });
export type Account = InferSchemaType<typeof accountSchema>;
export const AccountModel = getModel("Account", accountSchema, "accounts");

const sessionSchema = new Schema(
  {
    sessionToken: { type: String, required: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expires: { type: Date, required: true },
  },
  schemaOptions,
);
sessionSchema.index({ sessionToken: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
export type Session = InferSchemaType<typeof sessionSchema>;
export const SessionModel = getModel("Session", sessionSchema, "sessions");

const verificationTokenSchema = new Schema(
  {
    identifier: { type: String, required: true },
    token: { type: String, required: true },
    expires: { type: Date, required: true },
  },
  { versionKey: false },
);
verificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true });
verificationTokenSchema.index({ token: 1 }, { unique: true });
verificationTokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
export type VerificationToken = InferSchemaType<typeof verificationTokenSchema>;
export const VerificationTokenModel = getModel(
  "VerificationToken",
  verificationTokenSchema,
  "verification_tokens",
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
  },
  schemaOptions,
);
workspaceSchema.index({ slug: 1 }, { unique: true });
workspaceSchema.index({ createdAt: -1 });
export type Workspace = InferSchemaType<typeof workspaceSchema>;
export const WorkspaceModel = getModel(
  "Workspace",
  workspaceSchema,
  "workspaces",
);

const workspaceMemberSchema = new Schema(
  {
    role: {
      type: String,
      enum: Object.values(WorkspaceRole),
      default: WorkspaceRole.MEMBER,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
  },
  schemaOptions,
);
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1 });
workspaceMemberSchema.index({ workspaceId: 1, role: 1 });
workspaceMemberSchema.index({ createdAt: -1 });
export type WorkspaceMember = InferSchemaType<typeof workspaceMemberSchema>;
export const WorkspaceMemberModel = getModel(
  "WorkspaceMember",
  workspaceMemberSchema,
  "workspace_members",
);

const invitationSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: Object.values(WorkspaceRole),
      default: WorkspaceRole.MEMBER,
      required: true,
    },
    token: { type: String, required: true },
    invitedById: { type: Schema.Types.ObjectId, ref: "User" },
    acceptedById: { type: Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    revokedAt: Date,
  },
  schemaOptions,
);
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ workspaceId: 1, email: 1 });
invitationSchema.index({ invitedById: 1 });
invitationSchema.index({ acceptedById: 1 });
invitationSchema.index({ expiresAt: 1 });
invitationSchema.index({ createdAt: -1 });
export type Invitation = InferSchemaType<typeof invitationSchema>;
export const InvitationModel = getModel(
  "Invitation",
  invitationSchema,
  "invitations",
);

const clientSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    companyName: { type: String, trim: true, maxlength: 120 },
    normalizedCompanyName: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    contactName: { type: String, trim: true, maxlength: 100 },
    isActive: { type: Boolean, default: true, required: true },
    // Legacy fields remain readable for records created before client management.
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 30 },
    notes: { type: String, maxlength: 2_000 },
  },
  schemaOptions,
);
clientSchema.index(
  { workspaceId: 1, normalizedCompanyName: 1 },
  {
    unique: true,
    partialFilterExpression: { normalizedCompanyName: { $type: "string" } },
  },
);
clientSchema.index({ workspaceId: 1, isActive: 1, companyName: 1 });
clientSchema.index({ workspaceId: 1, name: 1 });
clientSchema.index({ workspaceId: 1, email: 1 });
clientSchema.index({ createdById: 1 });
clientSchema.index({ createdAt: -1 });
export type Client = InferSchemaType<typeof clientSchema>;
export const ClientModel = getModel("Client", clientSchema, "clients");

const leadProblemSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    category: { type: String, required: true, maxlength: 40 },
    severity: {
      type: String,
      enum: [
        FindingSeverity.CRITICAL,
        FindingSeverity.WARNING,
        FindingSeverity.RECOMMENDATION,
      ],
      required: true,
    },
  },
  { _id: false, versionKey: false },
);

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 30 },
    websiteUrl: { type: String, required: true, maxlength: 2048 },
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    auditScore: { type: Number, min: 0, max: 100 },
    topDetectedProblems: {
      type: [leadProblemSchema],
      default: [],
      validate: {
        validator: (value: unknown[]) => value.length <= 5,
        message: "A lead can retain at most five detected problems.",
      },
    },
    requestedService: {
      type: String,
      enum: Object.values(LeadRequestedService),
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(LeadSource),
      required: true,
    },
    dedupeKey: { type: String, required: true, select: false },
  },
  schemaOptions,
);
leadSchema.index({ dedupeKey: 1 }, { unique: true });
leadSchema.index({ auditId: 1 });
leadSchema.index({ email: 1, createdAt: -1 });
leadSchema.index({ requestedService: 1, createdAt: -1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ createdAt: -1, _id: -1 });
export type Lead = InferSchemaType<typeof leadSchema>;
export const LeadModel = getModel("Lead", leadSchema, "leads");

const websiteSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, trim: true },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    isActive: { type: Boolean, default: true, required: true },
    lastAuditedAt: Date,
    expiresAt: Date,
  },
  schemaOptions,
);
websiteSchema.index({ workspaceId: 1, normalizedUrl: 1 }, { unique: true });
websiteSchema.index({ workspaceId: 1, createdAt: -1 });
websiteSchema.index({ clientId: 1 });
websiteSchema.index({ createdById: 1 });
websiteSchema.index({ normalizedUrl: 1 });
websiteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type Website = InferSchemaType<typeof websiteSchema>;
export const WebsiteModel = getModel("Website", websiteSchema, "websites");

const crawlDiscoverySchema = new Schema(
  {
    robots: {
      url: { type: String, required: true },
      status: {
        type: String,
        enum: ["FOUND", "NOT_FOUND", "UNAVAILABLE"],
        required: true,
      },
      applied: { type: Boolean, required: true },
    },
    sitemap: {
      declaredUrls: { type: [String], default: [] },
      processedUrls: { type: [String], default: [] },
      pageUrls: { type: [String], default: [] },
      pageUrlsDiscovered: { type: Number, default: 0, min: 0 },
      rejectedUrlCount: { type: Number, default: 0, min: 0 },
      truncated: { type: Boolean, default: false },
    },
    internalLinkUrlsDiscovered: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const auditPipelineSteps = [
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
] as const;

const auditPipelineDiagnosticSchema = new Schema(
  {
    engine: {
      type: String,
      enum: ["PIPELINE", "ACCESSIBILITY", "SECURITY", "PERFORMANCE", "MOBILE"],
      required: true,
    },
    step: {
      type: String,
      enum: auditPipelineSteps,
      required: true,
    },
    outcome: {
      type: String,
      enum: ["UNAVAILABLE", "PARTIAL", "RETRY_SCHEDULED", "FAILED"],
      required: true,
    },
    code: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: 500 },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const auditSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    websiteId: {
      type: Schema.Types.ObjectId,
      ref: "Website",
      required: true,
    },
    requestedById: { type: Schema.Types.ObjectId, ref: "User" },
    scheduledAuditId: { type: Schema.Types.ObjectId, ref: "ScheduledAudit" },
    type: {
      type: String,
      enum: Object.values(AuditType),
      default: AuditType.STANDARD,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AuditStatus),
      default: AuditStatus.QUEUED,
      required: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100, required: true },
    currentStage: {
      type: String,
      enum: Object.values(AuditStatus),
      default: AuditStatus.QUEUED,
      required: true,
    },
    pagesDiscovered: { type: Number, default: 0, min: 0, required: true },
    pagesCrawled: { type: Number, default: 0, min: 0, required: true },
    usagePageReservation: { type: Number, default: 0, min: 0, required: true },
    usagePeriodStart: Date,
    usagePeriodEnd: Date,
    pageUsageSettledAt: Date,
    statusMessage: {
      type: String,
      default: "Waiting for an audit worker.",
      required: true,
    },
    overallScore: { type: Number, min: 0, max: 100 },
    failureReason: String,
    failureCode: String,
    failureStage: {
      type: String,
      enum: Object.values(AuditStatus),
    },
    failureStep: { type: String, enum: auditPipelineSteps },
    pipelineDiagnostics: {
      type: [auditPipelineDiagnosticSchema],
      default: [],
    },
    configuration: Schema.Types.Mixed,
    crawlDiscovery: crawlDiscoverySchema,
    startedAt: Date,
    completedAt: Date,
    expiresAt: Date,
  },
  schemaOptions,
);
auditSchema.index({ workspaceId: 1, createdAt: -1 });
auditSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
auditSchema.index({ workspaceId: 1, websiteId: 1, createdAt: -1 });
auditSchema.index({ workspaceId: 1, websiteId: 1, status: 1, createdAt: -1 });
auditSchema.index({ websiteId: 1, createdAt: -1 });
auditSchema.index({ requestedById: 1 });
auditSchema.index({ scheduledAuditId: 1 });
auditSchema.index({ status: 1, createdAt: -1 });
auditSchema.index({ type: 1, createdAt: -1 });
auditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type Audit = InferSchemaType<typeof auditSchema>;
export const AuditModel = getModel("Audit", auditSchema, "audits");

const auditPageSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    title: String,
    metaDescription: String,
    canonicalUrl: String,
    canonicalDeclarations: { type: [String], default: [] },
    redirectUrl: String,
    redirectCount: { type: Number, default: 0, min: 0 },
    redirectChain: {
      type: [
        new Schema(
          {
            sourceUrl: { type: String, required: true },
            statusCode: { type: Number, required: true, min: 300, max: 399 },
            destinationUrl: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    fetchErrorCode: String,
    contentType: String,
    language: String,
    robotsDirectives: { type: [String], default: [] },
    openGraphTitle: String,
    openGraphDescription: String,
    openGraphImage: String,
    twitterCard: String,
    twitterTitle: String,
    twitterDescription: String,
    twitterImage: String,
    viewport: String,
    isIndexable: Boolean,
    headingCount: { type: Number, min: 0 },
    h1Count: { type: Number, min: 0 },
    h2Count: { type: Number, min: 0 },
    h3Count: { type: Number, min: 0 },
    h4Count: { type: Number, min: 0 },
    h5Count: { type: Number, min: 0 },
    h6Count: { type: Number, min: 0 },
    imageCount: { type: Number, min: 0 },
    imagesMissingAlt: { type: Number, min: 0 },
    internalLinkCount: { type: Number, min: 0 },
    externalLinkCount: { type: Number, min: 0 },
    structuredDataCount: { type: Number, min: 0 },
    invalidStructuredDataCount: { type: Number, min: 0 },
    formCount: { type: Number, min: 0 },
    formControlCount: { type: Number, min: 0 },
    labeledFormControlCount: { type: Number, min: 0 },
    labelCount: { type: Number, min: 0 },
    buttonCount: { type: Number, min: 0 },
    scriptCount: { type: Number, min: 0 },
    stylesheetCount: { type: Number, min: 0 },
    iframeCount: { type: Number, min: 0 },
    mixedContentResourceCount: { type: Number, min: 0 },
    metadataTruncatedFields: { type: [String], default: [] },
    discoveredVia: {
      type: String,
      enum: ["ROOT", "LINK", "SITEMAP"],
    },
    statusCode: { type: Number, min: 100, max: 599 },
    depth: { type: Number, default: 0, min: 0, required: true },
    loadTimeMs: { type: Number, min: 0 },
    pageSizeBytes: { type: Number, min: 0 },
    errorMessage: String,
    crawledAt: Date,
    expiresAt: Date,
  },
  schemaOptions,
);
auditPageSchema.index({ auditId: 1, normalizedUrl: 1 }, { unique: true });
auditPageSchema.index({ auditId: 1, statusCode: 1 });
auditPageSchema.index({ auditId: 1, depth: 1, normalizedUrl: 1 });
auditPageSchema.index({ normalizedUrl: 1 });
auditPageSchema.index({ createdAt: -1 });
auditPageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type AuditPage = InferSchemaType<typeof auditPageSchema>;
export const AuditPageModel = getModel(
  "AuditPage",
  auditPageSchema,
  "audit_pages",
);

const auditScoreSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    category: {
      type: String,
      enum: Object.values(AuditScoreCategory),
      required: true,
    },
    score: { type: Number, required: true, min: 0, max: 100 },
    evaluated: { type: Boolean, default: true, required: true },
    weight: { type: Number, default: 0, min: 0, max: 1, required: true },
    evaluatedWeight: { type: Number, min: 0, max: 1 },
    deduction: { type: Number, default: 0, min: 0, max: 100 },
    passedCredit: { type: Number, default: 0, min: 0, max: 100 },
    failingRuleCount: { type: Number, default: 0, min: 0 },
    passedRuleCount: { type: Number, default: 0, min: 0 },
    expiresAt: Date,
  },
  schemaOptions,
);
auditScoreSchema.index({ auditId: 1, category: 1 }, { unique: true });
auditScoreSchema.index({ auditId: 1 });
auditScoreSchema.index({ category: 1, score: -1 });
auditScoreSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type AuditScore = InferSchemaType<typeof auditScoreSchema>;
export const AuditScoreModel = getModel(
  "AuditScore",
  auditScoreSchema,
  "audit_scores",
);

const auditFindingSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    auditPageId: { type: Schema.Types.ObjectId, ref: "AuditPage" },
    category: {
      type: String,
      enum: Object.values(AuditCategory),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(FindingSeverity),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(FindingStatus),
      default: FindingStatus.OPEN,
      required: true,
    },
    ruleCode: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    affectedUrl: { type: String, default: null },
    evidence: { type: Schema.Types.Mixed, default: {}, required: true },
    recommendation: { type: String, required: true },
    scoreImpact: { type: Number, required: true, min: 0, max: 100 },
    affectedPageCount: { type: Number, min: 0 },
    evaluatedPageCount: { type: Number, min: 1 },
    affectedElement: String,
    occurrences: { type: Number, default: 1, min: 1, required: true },
    resolvedAt: Date,
    expiresAt: Date,
  },
  schemaOptions,
);
// These new unique boundaries require a duplicate preflight on existing data.
auditFindingSchema.set("autoIndex", false);
auditFindingSchema.index({ auditId: 1, status: 1 });
auditFindingSchema.index({ auditId: 1, severity: 1 });
auditFindingSchema.index({ auditId: 1, category: 1 });
auditFindingSchema.index({ auditId: 1, status: 1, severity: 1, category: 1 });
auditFindingSchema.index({ auditId: 1, scoreImpact: -1, createdAt: -1 });
auditFindingSchema.index({ auditId: 1, ruleCode: 1, affectedUrl: 1 });
auditFindingSchema.index(AUDIT_FINDING_IDENTITY_KEYS, {
  unique: true,
  name: AUDIT_FINDING_IDENTITY_INDEX,
});
auditFindingSchema.index({ auditPageId: 1 });
auditFindingSchema.index({ auditPageId: 1, category: 1, severity: 1 });
auditFindingSchema.index({ ruleCode: 1 });
auditFindingSchema.index({ createdAt: -1 });
auditFindingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type AuditFinding = InferSchemaType<typeof auditFindingSchema>;
export const AuditFindingModel = getModel(
  "AuditFinding",
  auditFindingSchema,
  "audit_findings",
);

const auditMetricSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    auditPageId: { type: Schema.Types.ObjectId, ref: "AuditPage" },
    category: {
      type: String,
      enum: Object.values(AuditCategory),
      required: true,
    },
    key: { type: String, required: true },
    value: { type: Number, required: true },
    unit: String,
    expiresAt: Date,
  },
  schemaOptions,
);
auditMetricSchema.set("autoIndex", false);
auditMetricSchema.index({ auditId: 1, key: 1 });
auditMetricSchema.index(AUDIT_METRIC_IDENTITY_KEYS, {
  unique: true,
  name: AUDIT_METRIC_IDENTITY_INDEX,
});
auditMetricSchema.index({ auditId: 1, category: 1 });
auditMetricSchema.index({ auditPageId: 1 });
auditMetricSchema.index({ createdAt: -1 });
auditMetricSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type AuditMetric = InferSchemaType<typeof auditMetricSchema>;
export const AuditMetricModel = getModel(
  "AuditMetric",
  auditMetricSchema,
  "audit_metrics",
);

const auditJobSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AuditStatus),
      default: AuditStatus.QUEUED,
      required: true,
    },
    priority: { type: Number, default: 0, required: true },
    attempts: { type: Number, default: 0, min: 0, required: true },
    maxAttempts: { type: Number, default: 3, min: 1, required: true },
    runAt: { type: Date, default: Date.now, required: true },
    lockedAt: Date,
    lockedBy: String,
    lastError: String,
    finishedAt: Date,
    expiresAt: Date,
  },
  schemaOptions,
);
auditJobSchema.index({ auditId: 1 }, { unique: true });
auditJobSchema.index({ status: 1, runAt: 1, priority: -1 });
auditJobSchema.index({ lockedAt: 1 });
auditJobSchema.index({ createdAt: -1 });
auditJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type AuditJob = InferSchemaType<typeof auditJobSchema>;
export const AuditJobModel = getModel("AuditJob", auditJobSchema, "audit_jobs");

const workerHeartbeatSchema = new Schema(
  {
    workerId: { type: String, required: true, trim: true },
    state: { type: String, enum: ["RUNNING", "STOPPED"], required: true },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    stoppedAt: Date,
  },
  schemaOptions,
);
workerHeartbeatSchema.index({ workerId: 1 }, { unique: true });
workerHeartbeatSchema.index({ state: 1, lastSeenAt: -1 });
workerHeartbeatSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 604_800 });
export type WorkerHeartbeat = InferSchemaType<typeof workerHeartbeatSchema>;
export const WorkerHeartbeatModel = getModel(
  "WorkerHeartbeat",
  workerHeartbeatSchema,
  "worker_heartbeats",
);

const publicAuditRequestSchema = new Schema(
  {
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    websiteId: {
      type: Schema.Types.ObjectId,
      ref: "Website",
      required: true,
    },
    publicTokenHash: { type: String, required: true },
    clientKeyHash: { type: String, required: true },
    targetHash: { type: String, required: true },
    targetUrl: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
publicAuditRequestSchema.index({ auditId: 1 }, { unique: true });
publicAuditRequestSchema.index({ publicTokenHash: 1 }, { unique: true });
publicAuditRequestSchema.index({ clientKeyHash: 1, createdAt: -1 });
publicAuditRequestSchema.index({ targetHash: 1, createdAt: -1 });
publicAuditRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type PublicAuditRequest = InferSchemaType<
  typeof publicAuditRequestSchema
>;
export const PublicAuditRequestModel = getModel(
  "PublicAuditRequest",
  publicAuditRequestSchema,
  "public_audit_requests",
);

const publicAuditRateLimitSchema = new Schema(
  {
    scope: {
      type: String,
      enum: [
        "GLOBAL_MINUTE",
        "CLIENT_HOUR",
        "CLIENT_DAY",
        "TARGET_DAY",
        "STATUS_GLOBAL_MINUTE",
        "STATUS_CLIENT_MINUTE",
        "LEAD_GLOBAL_MINUTE",
        "LEAD_CLIENT_HOUR",
        "LEAD_EMAIL_DAY",
        "LEAD_AUDIT_DAY",
      ],
      required: true,
    },
    keyHash: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0, min: 0, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
publicAuditRateLimitSchema.index(
  { scope: 1, keyHash: 1, windowStart: 1 },
  { unique: true },
);
publicAuditRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type PublicAuditRateLimit = InferSchemaType<
  typeof publicAuditRateLimitSchema
>;
export const PublicAuditRateLimitModel = getModel(
  "PublicAuditRateLimit",
  publicAuditRateLimitSchema,
  "public_audit_rate_limits",
);

/**
 * Generic, short-lived counters for server-side abuse prevention. Keys are
 * one-way HMAC digests created by the web application; no raw account, email,
 * IP address, or browser identifier is persisted here.
 */
const rateLimitCounterSchema = new Schema(
  {
    scope: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      match: /^[A-Z][A-Z0-9_]*$/,
    },
    keyHash: { type: String, required: true, minlength: 64, maxlength: 128 },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0, min: 0, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
rateLimitCounterSchema.index(
  { scope: 1, keyHash: 1, windowStart: 1 },
  { unique: true },
);
rateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type RateLimitCounter = InferSchemaType<typeof rateLimitCounterSchema>;
export const RateLimitCounterModel = getModel(
  "RateLimitCounter",
  rateLimitCounterSchema,
  "rate_limit_counters",
);

const scheduledAuditSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    websiteId: {
      type: Schema.Types.ObjectId,
      ref: "Website",
      required: true,
    },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: Object.values(AuditType),
      default: AuditType.FULL_SITE,
      required: true,
    },
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: "UTC", required: true },
    isActive: { type: Boolean, default: true, required: true },
    lastRunAt: Date,
    nextRunAt: Date,
  },
  schemaOptions,
);
scheduledAuditSchema.index({ workspaceId: 1, isActive: 1 });
scheduledAuditSchema.index({ websiteId: 1 });
scheduledAuditSchema.index({ createdById: 1 });
scheduledAuditSchema.index({ isActive: 1, nextRunAt: 1 });
scheduledAuditSchema.index({ createdAt: -1 });
export type ScheduledAudit = InferSchemaType<typeof scheduledAuditSchema>;
export const ScheduledAuditModel = getModel(
  "ScheduledAudit",
  scheduledAuditSchema,
  "scheduled_audits",
);

const reportSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    auditId: {
      type: Schema.Types.ObjectId,
      ref: "Audit",
      required: true,
    },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    format: { type: String, default: "PDF", required: true },
    status: {
      type: String,
      enum: Object.values(ReportGenerationStatus),
      default: ReportGenerationStatus.GENERATING,
      required: true,
    },
    fileName: String,
    mimeType: { type: String, default: "application/pdf" },
    fileSizeBytes: { type: Number, min: 0 },
    checksumSha256: String,
    fileUrl: String,
    publicToken: String,
    generatedAt: Date,
    failureReason: { type: String, maxlength: 500 },
    expiresAt: Date,
  },
  schemaOptions,
);
reportSchema.index({ publicToken: 1 }, { unique: true, sparse: true });
reportSchema.index({ workspaceId: 1, createdAt: -1 });
reportSchema.index({ auditId: 1 });
reportSchema.index({ workspaceId: 1, auditId: 1, format: 1, createdAt: -1 });
reportSchema.index({ clientId: 1 });
reportSchema.index({ createdById: 1 });
export type Report = InferSchemaType<typeof reportSchema>;
export const ReportModel = getModel("Report", reportSchema, "reports");

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    href: { type: String, trim: true, maxlength: 500 },
    dedupeKey: { type: String, trim: true, maxlength: 240, select: false },
    data: Schema.Types.Mixed,
    readAt: Date,
  },
  schemaOptions,
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({
  userId: 1,
  workspaceId: 1,
  readAt: 1,
  createdAt: -1,
});
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);
notificationSchema.index({ workspaceId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = getModel(
  "Notification",
  notificationSchema,
  "notifications",
);

const usageRecordSchema = new Schema(
  {
    counterKey: { type: String, trim: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    auditId: { type: Schema.Types.ObjectId, ref: "Audit" },
    metric: {
      type: String,
      enum: Object.values(UsageMetric),
      required: true,
    },
    quantity: { type: Number, default: 1, min: 0, required: true },
    adjustmentKeys: {
      type: [String],
      default: [],
      select: false,
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
  },
  schemaOptions,
);
usageRecordSchema.index({ counterKey: 1 }, { unique: true, sparse: true });
usageRecordSchema.index({ workspaceId: 1, metric: 1, periodStart: 1 });
usageRecordSchema.index({ workspaceId: 1, createdAt: -1 });
usageRecordSchema.index({ userId: 1 });
usageRecordSchema.index({ auditId: 1 });
export type UsageRecord = InferSchemaType<typeof usageRecordSchema>;
export const UsageRecordModel = getModel(
  "UsageRecord",
  usageRecordSchema,
  "usage_records",
);

/**
 * A Super Admin can grant an additional allowance for a specific billing
 * period. Credits increase an authoritative workspace limit; they never
 * reduce or mutate the recorded usage itself.
 */
const usageCreditSchema = new Schema(
  {
    // Optional for pre-idempotency records; every new grant supplies this key.
    requestKey: { type: String, trim: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grantedById: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    metric: {
      type: String,
      enum: Object.values(UsageMetric),
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, max: 1_000_000 },
    note: { type: String, trim: true, maxlength: 240 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
  },
  schemaOptions,
);
usageCreditSchema.index({ workspaceId: 1, metric: 1, periodEnd: 1 });
usageCreditSchema.index({ requestKey: 1 }, { unique: true, sparse: true });
usageCreditSchema.index({ recipientUserId: 1, createdAt: -1 });
usageCreditSchema.index({ grantedById: 1, createdAt: -1 });
usageCreditSchema.index({ workspaceId: 1, createdAt: -1 });
export type UsageCredit = InferSchemaType<typeof usageCreditSchema>;
export const UsageCreditModel = getModel(
  "UsageCredit",
  usageCreditSchema,
  "usage_credits",
);

const planSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    description: String,
    monthlyPriceCents: { type: Number, default: 0, min: 0, required: true },
    yearlyPriceCents: { type: Number, default: 0, min: 0, required: true },
    // These catalog fields retain compatibility with existing plan records.
    // Runtime enforcement always uses the versioned policy in @website-audit/shared.
    monthlyAuditLimit: {
      type: Number,
      default: freePlanEntitlements.limits.monthlyAudits,
      min: 0,
      required: true,
    },
    pagesPerAuditLimit: {
      type: Number,
      default: freePlanEntitlements.limits.crawlPagesPerAudit,
      min: 0,
      required: true,
    },
    workspaceMemberLimit: {
      type: Number,
      default: freePlanEntitlements.limits.workspaceMembers,
      min: 1,
      required: true,
    },
    features: Schema.Types.Mixed,
    isActive: { type: Boolean, default: true, required: true },
  },
  schemaOptions,
);
planSchema.index({ slug: 1 }, { unique: true });
planSchema.index({ isActive: 1 });
export type Plan = InferSchemaType<typeof planSchema>;
export const PlanModel = getModel("Plan", planSchema, "plans");

const subscriptionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.TRIALING,
      required: true,
    },
    externalCustomerId: String,
    externalSubscriptionId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    trialEndsAt: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false, required: true },
    cancelledAt: Date,
  },
  schemaOptions,
);
subscriptionSchema.index({ workspaceId: 1 }, { unique: true });
subscriptionSchema.index(
  { externalCustomerId: 1 },
  { unique: true, sparse: true },
);
subscriptionSchema.index(
  { externalSubscriptionId: 1 },
  { unique: true, sparse: true },
);
subscriptionSchema.index({ planId: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ createdAt: -1 });
export type Subscription = InferSchemaType<typeof subscriptionSchema>;
export const SubscriptionModel = getModel(
  "Subscription",
  subscriptionSchema,
  "subscriptions",
);

/** A Razorpay order and its immutable server-priced plan snapshot. */
const paymentOrderSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    planTier: {
      type: String,
      enum: [PlanTier.PRO, PlanTier.AGENCY],
      required: true,
    },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], required: true },
    receipt: { type: String, required: true },
    providerOrderId: { type: String, required: true },
    providerPaymentId: String,
    status: {
      type: String,
      enum: ["CREATED", "CAPTURED"],
      default: "CREATED",
      required: true,
    },
    capturedAt: Date,
    periodStart: Date,
    periodEnd: Date,
  },
  schemaOptions,
);
paymentOrderSchema.index({ receipt: 1 }, { unique: true });
paymentOrderSchema.index({ providerOrderId: 1 }, { unique: true });
paymentOrderSchema.index(
  { providerPaymentId: 1 },
  { unique: true, sparse: true },
);
paymentOrderSchema.index({ workspaceId: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1, createdAt: -1 });
export type PaymentOrder = InferSchemaType<typeof paymentOrderSchema>;
export const PaymentOrderModel = getModel(
  "PaymentOrder",
  paymentOrderSchema,
  "payment_orders",
);

const whiteLabelSettingSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    brandName: String,
    logoUrl: String,
    faviconUrl: String,
    primaryColor: String,
    customDomain: { type: String, lowercase: true, trim: true },
    supportEmail: { type: String, lowercase: true, trim: true },
  },
  schemaOptions,
);
whiteLabelSettingSchema.index({ workspaceId: 1 }, { unique: true });
whiteLabelSettingSchema.index(
  { customDomain: 1 },
  { unique: true, sparse: true },
);
export type WhiteLabelSetting = InferSchemaType<typeof whiteLabelSettingSchema>;
export const WhiteLabelSettingModel = getModel(
  "WhiteLabelSetting",
  whiteLabelSettingSchema,
  "white_label_settings",
);

const activityLogSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    metadata: Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
  },
  { timestamps, versionKey: false, strict: true },
);
activityLogSchema.index({ workspaceId: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
export type ActivityLog = InferSchemaType<typeof activityLogSchema>;
export const ActivityLogModel = getModel(
  "ActivityLog",
  activityLogSchema,
  "activity_logs",
);

export const databaseModels = [
  UserModel,
  AccountModel,
  SessionModel,
  VerificationTokenModel,
  WorkspaceModel,
  WorkspaceMemberModel,
  InvitationModel,
  ClientModel,
  LeadModel,
  WebsiteModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
  AuditFindingModel,
  AuditMetricModel,
  AuditJobModel,
  WorkerHeartbeatModel,
  PublicAuditRequestModel,
  PublicAuditRateLimitModel,
  RateLimitCounterModel,
  ScheduledAuditModel,
  ReportModel,
  NotificationModel,
  UsageRecordModel,
  UsageCreditModel,
  PlanModel,
  SubscriptionModel,
  PaymentOrderModel,
  WhiteLabelSettingModel,
  ActivityLogModel,
] as const;
