import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  type AuditCategory,
  type AuditType,
  type FindingSeverity,
  FindingStatus,
  type FindingStatus as FindingStatusValue,
} from "../enums.js";
import {
  ActivityLogModel,
  AuditFindingModel,
  AuditModel,
  WebsiteModel,
} from "../models.js";

export const issueSortValues = [
  "IMPACT_DESC",
  "NEWEST",
  "OLDEST",
  "TITLE_ASC",
  "PAGE_ASC",
] as const;
export type IssueSort = (typeof issueSortValues)[number];

export type IssueExplorerFilters = {
  websiteId?: string;
  auditId?: string;
  category?: AuditCategory;
  severity?: FindingSeverity;
  status?: FindingStatusValue;
  affectedPage?: string;
  search?: string;
  sort: IssueSort;
  page: number;
  pageSize: number;
};

export type IssueExplorerItem = {
  id: string;
  auditId: string;
  websiteId: string;
  websiteName: string;
  auditType: AuditType;
  auditCreatedAt: Date;
  category: AuditCategory;
  severity: FindingSeverity;
  status: FindingStatusValue;
  ruleCode: string;
  title: string;
  description: string;
  affectedUrl: string | null;
  evidence: unknown;
  recommendation: string;
  scoreImpact: number;
  occurrences: number;
  detectedAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

export type IssueExplorerResult = {
  items: IssueExplorerItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  options: {
    websites: Array<{ id: string; name: string }>;
    audits: Array<{
      id: string;
      websiteId: string;
      websiteName: string;
      type: AuditType;
      createdAt: Date;
    }>;
    affectedPages: string[];
  };
};

type AuditScopeRecord = {
  _id: Types.ObjectId;
  websiteId: Types.ObjectId;
  type: AuditType;
  createdAt: Date;
};

const sortByIssueSort: Record<IssueSort, Record<string, 1 | -1>> = {
  IMPACT_DESC: { scoreImpact: -1, createdAt: -1 },
  NEWEST: { createdAt: -1 },
  OLDEST: { createdAt: 1 },
  TITLE_ASC: { title: 1, createdAt: -1 },
  PAGE_ASC: { affectedUrl: 1, createdAt: -1 },
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export async function listIssuesForWorkspace(input: {
  workspaceId: string;
  filters: IssueExplorerFilters;
}): Promise<IssueExplorerResult> {
  if (!Types.ObjectId.isValid(input.workspaceId)) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      pageCount: 0,
      options: { websites: [], audits: [], affectedPages: [] },
    };
  }

  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const websiteId =
    input.filters.websiteId && Types.ObjectId.isValid(input.filters.websiteId)
      ? new Types.ObjectId(input.filters.websiteId)
      : undefined;
  const requestedAuditId =
    input.filters.auditId && Types.ObjectId.isValid(input.filters.auditId)
      ? new Types.ObjectId(input.filters.auditId)
      : undefined;

  const auditScope = await AuditModel.find({
    workspaceId,
    ...(websiteId ? { websiteId } : {}),
    ...(requestedAuditId ? { _id: requestedAuditId } : {}),
  })
    .select({ websiteId: 1, type: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean<AuditScopeRecord[]>()
    .exec();

  const allWorkspaceAudits = await AuditModel.find({ workspaceId })
    .select({ websiteId: 1, type: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(250)
    .lean<AuditScopeRecord[]>()
    .exec();
  const websites = await WebsiteModel.find({ workspaceId })
    .select({ name: 1, url: 1 })
    .sort({ name: 1, url: 1 })
    .lean()
    .exec();
  const websiteById = new Map(
    websites.map((website) => [
      website._id.toString(),
      website.name?.trim() || website.url,
    ]),
  );

  const auditIds = auditScope.map((audit) => audit._id);
  const findingFilter: Record<string, unknown> = {
    auditId: { $in: auditIds },
    ...(input.filters.category ? { category: input.filters.category } : {}),
    ...(input.filters.severity ? { severity: input.filters.severity } : {}),
    ...(input.filters.status ? { status: input.filters.status } : {}),
    ...(input.filters.affectedPage
      ? { affectedUrl: input.filters.affectedPage }
      : {}),
  };
  if (input.filters.search) {
    const expression = new RegExp(escapeRegex(input.filters.search), "i");
    findingFilter.$or = [
      { title: expression },
      { description: expression },
      { ruleCode: expression },
      { affectedUrl: expression },
    ];
  }

  const pageSize = clampInteger(input.filters.pageSize, 10, 100);
  const total =
    auditIds.length === 0
      ? 0
      : await AuditFindingModel.countDocuments(findingFilter).exec();
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = clampInteger(input.filters.page, 1, Math.max(1, pageCount));
  const [findings, affectedPages] =
    auditIds.length === 0
      ? [[], []]
      : await Promise.all([
          AuditFindingModel.find(findingFilter)
            .sort(sortByIssueSort[input.filters.sort])
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean()
            .exec(),
          AuditFindingModel.distinct("affectedUrl", {
            auditId: { $in: auditIds },
            affectedUrl: { $type: "string", $ne: "" },
          }).exec(),
        ]);

  const auditById = new Map(
    auditScope.map((audit) => [audit._id.toString(), audit]),
  );
  const items = findings.flatMap((finding) => {
    const audit = auditById.get(finding.auditId.toString());
    if (!audit) return [];
    const websiteKey = audit.websiteId.toString();
    return [
      {
        id: finding._id.toString(),
        auditId: audit._id.toString(),
        websiteId: websiteKey,
        websiteName: websiteById.get(websiteKey) ?? "Unknown website",
        auditType: audit.type,
        auditCreatedAt: audit.createdAt,
        category: finding.category,
        severity: finding.severity,
        status: finding.status,
        ruleCode: finding.ruleCode,
        title: finding.title,
        description: finding.description,
        affectedUrl: finding.affectedUrl ?? null,
        evidence: finding.evidence,
        recommendation: finding.recommendation,
        scoreImpact: finding.scoreImpact,
        occurrences: finding.occurrences ?? 1,
        detectedAt: finding.createdAt,
        updatedAt: finding.updatedAt,
        resolvedAt: finding.resolvedAt ?? null,
      },
    ];
  });

  return {
    items,
    total,
    page,
    pageSize,
    pageCount,
    options: {
      websites: websites.map((website) => ({
        id: website._id.toString(),
        name: website.name?.trim() || website.url,
      })),
      audits: allWorkspaceAudits.map((audit) => {
        const websiteKey = audit.websiteId.toString();
        return {
          id: audit._id.toString(),
          websiteId: websiteKey,
          websiteName: websiteById.get(websiteKey) ?? "Unknown website",
          type: audit.type,
          createdAt: audit.createdAt,
        };
      }),
      affectedPages: affectedPages
        .filter((value): value is string => typeof value === "string")
        .sort((first, second) => first.localeCompare(second))
        .slice(0, 250),
    },
  };
}

export type UpdateIssueWorkflowResult =
  | { outcome: "not_found" }
  | {
      outcome: "updated";
      issue: {
        id: string;
        status: FindingStatusValue;
        resolvedAt: Date | null;
      };
    };

export async function updateIssueWorkflowStatus(input: {
  workspaceId: string;
  userId: string;
  findingId: string;
  status: FindingStatusValue;
}): Promise<UpdateIssueWorkflowResult> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.userId) ||
    !Types.ObjectId.isValid(input.findingId)
  ) {
    return { outcome: "not_found" };
  }

  await connectToDatabase();
  const session = await mongoose.startSession();
  let result: UpdateIssueWorkflowResult = { outcome: "not_found" };
  try {
    await session.withTransaction(async () => {
      const finding = await AuditFindingModel.findById(input.findingId)
        .select({ auditId: 1, status: 1 })
        .session(session)
        .lean()
        .exec();
      if (!finding) return;

      const authorizedAudit = await AuditModel.exists({
        _id: finding.auditId,
        workspaceId: input.workspaceId,
      }).session(session);
      if (!authorizedAudit) return;

      const resolvedAt =
        input.status === FindingStatus.FIXED ? new Date() : null;
      const updated = await AuditFindingModel.findOneAndUpdate(
        { _id: finding._id, auditId: finding.auditId },
        { $set: { status: input.status, resolvedAt } },
        { returnDocument: "after", runValidators: true, session },
      )
        .lean()
        .exec();
      if (!updated) return;

      await ActivityLogModel.create(
        [
          {
            workspaceId: input.workspaceId,
            userId: input.userId,
            action: "AUDIT_FINDING_STATUS_CHANGED",
            entityType: "AuditFinding",
            entityId: updated._id.toString(),
            metadata: {
              auditId: finding.auditId.toString(),
              previousStatus: finding.status,
              status: input.status,
            },
          },
        ],
        { session },
      );

      result = {
        outcome: "updated",
        issue: {
          id: updated._id.toString(),
          status: updated.status,
          resolvedAt: updated.resolvedAt ?? null,
        },
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
}
