import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  FindingSeverity,
  type AuditCategory as AuditCategoryValue,
  type AuditScoreCategory as AuditScoreCategoryValue,
  type AuditStatus as AuditStatusValue,
  type AuditType as AuditTypeValue,
  type FindingSeverity as FindingSeverityValue,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
  WebsiteModel,
} from "../models.js";
import {
  getPriorityActionFindings,
  type PriorityActionFindingRecord,
} from "./priority-action-data.js";

export type AuditReportScoreRecord = {
  category: AuditScoreCategoryValue;
  score: number;
  evaluated: boolean;
  weight: number;
  evaluatedWeight: number | null;
  deduction: number;
  passedCredit: number;
  failingRuleCount: number;
  passedRuleCount: number;
};

export type AuditReportFindingRecord = {
  id: string;
  category: AuditCategoryValue;
  severity: FindingSeverityValue;
  ruleCode: string;
  title: string;
  description: string;
  affectedUrl: string | null;
  recommendation: string;
  scoreImpact: number;
  occurrences: number;
};

export type AuditReportPageRecord = {
  id: string;
  url: string;
  title: string | null;
  statusCode: number | null;
  contentType: string | null;
  indexable: boolean;
  depth: number;
  loadTimeMs: number | null;
  pageSizeBytes: number;
  redirectCount: number;
  errorMessage: string | null;
};

export type AuditReportRecord = {
  audit: {
    id: string;
    status: AuditStatusValue;
    type: AuditTypeValue;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    pagesDiscovered: number;
    pagesCrawled: number;
  };
  website: {
    id: string;
    name: string;
    url: string;
  };
  scores: AuditReportScoreRecord[];
  issueCounts: Record<FindingSeverityValue, number>;
  findings: AuditReportFindingRecord[];
  findingTotal: number;
  priorityFindings: PriorityActionFindingRecord[];
  priorityFindingsTruncated: boolean;
  pages: AuditReportPageRecord[];
  pageTotal: number;
};

export type AuditReportQuery = {
  workspaceId: string;
  auditId: string;
  findingCategory?: AuditCategoryValue;
  includeFindings?: boolean;
  includePages?: boolean;
  includePriorityActions?: boolean;
  findingLimit?: number;
  pageLimit?: number;
};

function boundedLimit(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(value ?? fallback, 200));
}

export async function getAuditReportForWorkspace(
  input: AuditReportQuery,
): Promise<AuditReportRecord | null> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.auditId)
  ) {
    return null;
  }
  await connectToDatabase();
  const audit = await AuditModel.findOne({
    _id: input.auditId,
    workspaceId: input.workspaceId,
  })
    .select({
      websiteId: 1,
      status: 1,
      type: 1,
      createdAt: 1,
      startedAt: 1,
      completedAt: 1,
      pagesDiscovered: 1,
      pagesCrawled: 1,
    })
    .lean()
    .exec();
  if (!audit) return null;

  const auditId = audit._id;
  const findingFilter = {
    auditId,
    ...(input.findingCategory ? { category: input.findingCategory } : {}),
  };
  const findingLimit = boundedLimit(input.findingLimit, 100);
  const pageLimit = boundedLimit(input.pageLimit, 100);
  const [
    website,
    scores,
    severityGroups,
    findings,
    findingTotal,
    pages,
    pageTotal,
    priorityFindingSet,
  ] = await Promise.all([
    WebsiteModel.findOne({
      _id: audit.websiteId,
      workspaceId: input.workspaceId,
    })
      .select({ name: 1, url: 1 })
      .lean()
      .exec(),
    AuditScoreModel.find({ auditId }).sort({ category: 1 }).lean().exec(),
    AuditFindingModel.aggregate<{ _id: FindingSeverityValue; count: number }>([
      { $match: { auditId } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ]).exec(),
    input.includeFindings
      ? AuditFindingModel.find(findingFilter)
          .sort({ scoreImpact: -1, createdAt: 1 })
          .limit(findingLimit)
          .lean()
          .exec()
      : Promise.resolve([]),
    input.includeFindings
      ? AuditFindingModel.countDocuments(findingFilter).exec()
      : Promise.resolve(0),
    input.includePages
      ? AuditPageModel.find({ auditId })
          .sort({ depth: 1, normalizedUrl: 1 })
          .limit(pageLimit)
          .lean()
          .exec()
      : Promise.resolve([]),
    input.includePages
      ? AuditPageModel.countDocuments({ auditId }).exec()
      : Promise.resolve(0),
    input.includePriorityActions
      ? getPriorityActionFindings(auditId, audit.pagesCrawled ?? 0)
      : Promise.resolve({ findings: [], truncated: false }),
  ]);
  if (!website) return null;

  const issueCounts: Record<FindingSeverityValue, number> = {
    [FindingSeverity.CRITICAL]: 0,
    [FindingSeverity.WARNING]: 0,
    [FindingSeverity.RECOMMENDATION]: 0,
    [FindingSeverity.PASSED]: 0,
  };
  for (const group of severityGroups) issueCounts[group._id] = group.count;

  return {
    audit: {
      id: audit._id.toString(),
      status: audit.status,
      type: audit.type,
      createdAt: audit.createdAt,
      startedAt: audit.startedAt ?? null,
      completedAt: audit.completedAt ?? null,
      pagesDiscovered: audit.pagesDiscovered ?? 0,
      pagesCrawled: audit.pagesCrawled ?? 0,
    },
    website: {
      id: website._id.toString(),
      name: website.name?.trim() || website.url,
      url: website.url,
    },
    scores: scores.map((score) => ({
      category: score.category,
      score: score.score,
      evaluated: score.evaluated,
      weight: score.weight,
      evaluatedWeight: score.evaluatedWeight ?? null,
      deduction: score.deduction ?? 0,
      passedCredit: score.passedCredit ?? 0,
      failingRuleCount: score.failingRuleCount ?? 0,
      passedRuleCount: score.passedRuleCount ?? 0,
    })),
    issueCounts,
    findings: findings.map((finding) => ({
      id: finding._id.toString(),
      category: finding.category,
      severity: finding.severity,
      ruleCode: finding.ruleCode,
      title: finding.title,
      description: finding.description,
      affectedUrl: finding.affectedUrl ?? null,
      recommendation: finding.recommendation,
      scoreImpact: finding.scoreImpact,
      occurrences: finding.occurrences ?? 1,
    })),
    findingTotal,
    priorityFindings: priorityFindingSet.findings,
    priorityFindingsTruncated: priorityFindingSet.truncated,
    pages: pages.map((page) => ({
      id: page._id.toString(),
      url: page.url,
      title: page.title ?? null,
      statusCode: page.statusCode ?? null,
      contentType: page.contentType ?? null,
      indexable: page.isIndexable ?? false,
      depth: page.depth,
      loadTimeMs: page.loadTimeMs ?? null,
      pageSizeBytes: page.pageSizeBytes ?? 0,
      redirectCount: page.redirectCount ?? 0,
      errorMessage: page.errorMessage ?? null,
    })),
    pageTotal,
  };
}
