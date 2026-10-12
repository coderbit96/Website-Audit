import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditStatus,
  FindingSeverity,
  ReportGenerationStatus,
  type AuditCategory as AuditCategoryValue,
  type AuditScoreCategory as AuditScoreCategoryValue,
  type AuditType as AuditTypeValue,
  type FindingSeverity as FindingSeverityValue,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditMetricModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
  ReportModel,
  WebsiteModel,
} from "../models.js";
import {
  getPriorityActionFindings,
  type PriorityActionFindingRecord,
} from "./priority-action-data.js";
import { createReportReadyNotification } from "./notifications.js";
import { databaseLogger } from "../logger.js";

const reportMetricKeys = [
  "performance.pagespeed.mobile.score",
  "performance.pagespeed.mobile.lcp_ms",
  "performance.pagespeed.mobile.inp_ms",
  "performance.pagespeed.mobile.cls",
  "performance.pagespeed.mobile.fcp_ms",
  "performance.pagespeed.mobile.ttfb_ms",
  "performance.pagespeed.mobile.speed_index_ms",
  "performance.pagespeed.mobile.total_blocking_time_ms",
  "performance.pagespeed.desktop.score",
  "performance.pagespeed.desktop.lcp_ms",
  "performance.pagespeed.desktop.inp_ms",
  "performance.pagespeed.desktop.cls",
  "performance.pagespeed.desktop.fcp_ms",
  "performance.pagespeed.desktop.ttfb_ms",
  "performance.pagespeed.desktop.speed_index_ms",
  "performance.pagespeed.desktop.total_blocking_time_ms",
  "security.pages_evaluated",
  "security.tls_available_observed",
  "security.http_to_https_observed",
  "security.observed_configuration_checks",
  "security.confirmed_missing_checks",
  "security.observed_insecure_checks",
  "security.unknown_checks",
  "security.cookies_observed",
  "security.mixed_content_resources",
  "accessibility.browser_candidate_pages",
  "accessibility.browser_selected_pages",
  "accessibility.browser_analyzed_pages",
  "accessibility.browser_failed_pages",
  "accessibility.browser_truncated",
] as const;

export type PdfReportScore = {
  category: AuditScoreCategoryValue;
  score: number;
  evaluated: boolean;
};

export type PdfReportFinding = {
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

export type PdfReportMetric = {
  category: AuditCategoryValue;
  key: string;
  value: number;
  unit: string | null;
};

export type PdfReportPage = {
  url: string;
  title: string | null;
  statusCode: number | null;
  indexable: boolean;
};

export type PdfAuditReportData = {
  audit: {
    id: string;
    type: AuditTypeValue;
    createdAt: Date;
    completedAt: Date;
    durationMs: number | null;
    pagesDiscovered: number;
    pagesCrawled: number;
  };
  website: { id: string; name: string; url: string };
  scores: PdfReportScore[];
  issueCounts: Record<FindingSeverityValue, number>;
  findings: PdfReportFinding[];
  priorityFindings: PriorityActionFindingRecord[];
  priorityFindingsTruncated: boolean;
  metrics: PdfReportMetric[];
  pages: PdfReportPage[];
  pageTotal: number;
};

export type PdfAuditReportLookup =
  | { outcome: "ready"; data: PdfAuditReportData }
  | { outcome: "not_found" }
  | { outcome: "not_completed" };

const findingSeverities = [
  FindingSeverity.CRITICAL,
  FindingSeverity.WARNING,
  FindingSeverity.RECOMMENDATION,
] as const;

function durationMilliseconds(
  startedAt: Date | null | undefined,
  completedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

/** Loads only bounded, client-safe fields required for a downloadable PDF. */
export async function getPdfAuditReportForWorkspace(input: {
  workspaceId: string;
  auditId: string;
}): Promise<PdfAuditReportLookup> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.auditId)
  ) {
    return { outcome: "not_found" };
  }
  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const audit = await AuditModel.findOne({
    _id: input.auditId,
    workspaceId,
  })
    .select({
      websiteId: 1,
      type: 1,
      status: 1,
      createdAt: 1,
      startedAt: 1,
      completedAt: 1,
      pagesDiscovered: 1,
      pagesCrawled: 1,
    })
    .lean()
    .exec();
  if (!audit) return { outcome: "not_found" };
  if (audit.status !== AuditStatus.COMPLETED) {
    return { outcome: "not_completed" };
  }

  const auditId = audit._id;
  const [
    website,
    scores,
    severityGroups,
    findingsBySeverity,
    metrics,
    pages,
    pageTotal,
    priorityFindingSet,
  ] = await Promise.all([
    WebsiteModel.findOne({ _id: audit.websiteId, workspaceId })
      .select({ name: 1, url: 1 })
      .lean()
      .exec(),
    AuditScoreModel.find({ auditId })
      .select({ category: 1, score: 1, evaluated: 1 })
      .sort({ category: 1 })
      .lean()
      .exec(),
    AuditFindingModel.aggregate<{
      _id: FindingSeverityValue;
      count: number;
    }>([
      { $match: { auditId } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ]).exec(),
    Promise.all(
      findingSeverities.map((severity) =>
        AuditFindingModel.find({ auditId, severity })
          .select({
            category: 1,
            severity: 1,
            ruleCode: 1,
            title: 1,
            description: 1,
            affectedUrl: 1,
            recommendation: 1,
            scoreImpact: 1,
            occurrences: 1,
          })
          .sort({ scoreImpact: -1, ruleCode: 1, affectedUrl: 1 })
          .limit(20)
          .lean()
          .exec(),
      ),
    ),
    AuditMetricModel.find({ auditId, key: { $in: reportMetricKeys } })
      .select({ category: 1, key: 1, value: 1, unit: 1 })
      .sort({ key: 1 })
      .lean()
      .exec(),
    AuditPageModel.find({ auditId })
      .select({ url: 1, title: 1, statusCode: 1, isIndexable: 1 })
      .sort({ depth: 1, normalizedUrl: 1 })
      .limit(40)
      .lean()
      .exec(),
    AuditPageModel.countDocuments({ auditId }).exec(),
    getPriorityActionFindings(auditId, audit.pagesCrawled ?? 0),
  ]);
  if (!website) return { outcome: "not_found" };

  const issueCounts: Record<FindingSeverityValue, number> = {
    [FindingSeverity.CRITICAL]: 0,
    [FindingSeverity.WARNING]: 0,
    [FindingSeverity.RECOMMENDATION]: 0,
    [FindingSeverity.PASSED]: 0,
  };
  for (const group of severityGroups) issueCounts[group._id] = group.count;

  return {
    outcome: "ready",
    data: {
      audit: {
        id: audit._id.toString(),
        type: audit.type,
        createdAt: audit.createdAt,
        completedAt: audit.completedAt ?? audit.createdAt,
        durationMs: durationMilliseconds(audit.startedAt, audit.completedAt),
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
      })),
      issueCounts,
      findings: findingsBySeverity.flat().map((finding) => ({
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
      priorityFindings: priorityFindingSet.findings,
      priorityFindingsTruncated: priorityFindingSet.truncated,
      metrics: metrics.map((metric) => ({
        category: metric.category,
        key: metric.key,
        value: metric.value,
        unit: metric.unit ?? null,
      })),
      pages: pages.map((page) => ({
        url: page.url,
        title: page.title ?? null,
        statusCode: page.statusCode ?? null,
        indexable: page.isIndexable ?? false,
      })),
      pageTotal,
    },
  };
}

export async function createPdfReportGeneration(input: {
  workspaceId: string;
  auditId: string;
  createdById: string;
  title: string;
}): Promise<string> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.auditId) ||
    !Types.ObjectId.isValid(input.createdById)
  ) {
    throw new Error("PDF report metadata identifiers are invalid.");
  }
  await connectToDatabase();
  const audit = await AuditModel.findOne({
    _id: input.auditId,
    workspaceId: input.workspaceId,
  })
    .select({ websiteId: 1 })
    .lean()
    .exec();
  if (!audit) {
    throw new Error("The audit for this PDF report was not found.");
  }
  const website = await WebsiteModel.findOne({
    _id: audit.websiteId,
    workspaceId: input.workspaceId,
  })
    .select({ clientId: 1 })
    .lean()
    .exec();
  const report = await ReportModel.create({
    workspaceId: input.workspaceId,
    auditId: input.auditId,
    ...(website?.clientId ? { clientId: website.clientId } : {}),
    createdById: input.createdById,
    title: input.title.trim().slice(0, 200),
    format: "PDF",
    status: ReportGenerationStatus.GENERATING,
    mimeType: "application/pdf",
  });
  return report._id.toString();
}

export async function completePdfReportGeneration(input: {
  workspaceId: string;
  reportId: string;
  fileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
}): Promise<void> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.reportId)
  ) {
    throw new Error("PDF report metadata identifiers are invalid.");
  }
  await connectToDatabase();
  const result = await ReportModel.updateOne(
    { _id: input.reportId, workspaceId: input.workspaceId },
    {
      $set: {
        status: ReportGenerationStatus.COMPLETED,
        fileName: input.fileName.slice(0, 240),
        mimeType: "application/pdf",
        fileSizeBytes: Math.max(0, input.fileSizeBytes),
        checksumSha256: input.checksumSha256,
        generatedAt: new Date(),
      },
      $unset: { failureReason: "" },
    },
  ).exec();
  if (result.matchedCount === 1) {
    try {
      await createReportReadyNotification(input.reportId);
    } catch (error) {
      databaseLogger("error", "notification.report_ready_failed", {
        reportId: input.reportId,
        workspaceId: input.workspaceId,
        error,
      });
    }
  }
}

export async function failPdfReportGeneration(input: {
  workspaceId: string;
  reportId: string;
  failureReason: string;
}): Promise<void> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.reportId)
  ) {
    return;
  }
  await connectToDatabase();
  await ReportModel.updateOne(
    { _id: input.reportId, workspaceId: input.workspaceId },
    {
      $set: {
        status: ReportGenerationStatus.FAILED,
        failureReason: input.failureReason.trim().slice(0, 500),
      },
    },
  ).exec();
}
