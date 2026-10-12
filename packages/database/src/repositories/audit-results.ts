import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditCategory,
  AuditStatus,
  type AuditScoreCategory as AuditScoreCategoryValue,
  type FindingSeverity as FindingSeverityValue,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditMetricModel,
  AuditModel,
  AuditPageModel,
  AuditScoreModel,
} from "../models.js";

const activeAuditStatuses = [
  AuditStatus.INITIALIZING,
  AuditStatus.CRAWLING,
  AuditStatus.ANALYZING,
  AuditStatus.SCORING,
  AuditStatus.GENERATING_REPORT,
] as const;

export type AuditPageResultInput = {
  url: string;
  normalizedUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  canonicalDeclarations: readonly string[];
  redirectUrl: string | null;
  redirectCount: number;
  redirectChain: readonly {
    sourceUrl: string;
    statusCode: number;
    destinationUrl: string;
  }[];
  fetchErrorCode: string | null;
  contentType: string | null;
  language: string | null;
  robotsDirectives: readonly string[];
  openGraphTitle: string | null;
  openGraphDescription: string | null;
  openGraphImage: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  viewport: string | null;
  isIndexable: boolean;
  headingCount: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  structuredDataCount: number;
  invalidStructuredDataCount: number;
  formCount: number;
  formControlCount: number;
  labeledFormControlCount: number;
  labelCount: number;
  buttonCount: number;
  scriptCount: number;
  stylesheetCount: number;
  iframeCount: number;
  mixedContentResourceCount: number;
  metadataTruncatedFields: readonly string[];
  discoveredVia: "ROOT" | "LINK" | "SITEMAP";
  statusCode: number | null;
  depth: number;
  loadTimeMs: number | null;
  pageSizeBytes: number;
  errorMessage?: string;
};

export type AuditFindingResultInput = {
  category: AuditCategory;
  severity: FindingSeverityValue;
  ruleCode: string;
  title: string;
  description: string;
  affectedUrl: string | null;
  evidence: Readonly<Record<string, unknown>>;
  recommendation: string;
  scoreImpact: number;
  affectedPageCount?: number;
  evaluatedPageCount?: number;
  affectedElement?: string;
  occurrences?: number;
};

export type AuditMetricResultInput = {
  category?: AuditCategory;
  key: string;
  value: number;
  unit?: string;
};

export type AuditScoreResultInput = {
  category: AuditScoreCategoryValue;
  score: number;
  evaluated: boolean;
  weight: number;
  evaluatedWeight?: number;
  deduction: number;
  passedCredit: number;
  failingRuleCount: number;
  passedRuleCount: number;
};

export type CrawlDiscoveryInput = {
  robots: {
    url: string;
    status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
    applied: boolean;
  };
  sitemap: {
    declaredUrls: readonly string[];
    processedUrls: readonly string[];
    pageUrls: readonly string[];
    pageUrlsDiscovered: number;
    rejectedUrlCount: number;
    truncated: boolean;
  };
  internalLinkUrlsDiscovered: number;
};

export type AuditPipelineDiagnosticInput = {
  engine: "ACCESSIBILITY" | "SECURITY" | "PERFORMANCE" | "MOBILE";
  step:
    | "URL_VALIDATION"
    | "ROBOTS_AND_SITEMAPS"
    | "CRAWLING"
    | "SEO"
    | "TECHNICAL"
    | "ACCESSIBILITY"
    | "SECURITY"
    | "PERFORMANCE"
    | "MOBILE"
    | "SCORING"
    | "PERSISTING"
    | "FINALIZING";
  outcome: "UNAVAILABLE" | "PARTIAL";
  code: string;
  message: string;
};

async function deleteExistingResults(auditId: Types.ObjectId): Promise<void> {
  await Promise.all([
    AuditFindingModel.deleteMany({ auditId }),
    AuditMetricModel.deleteMany({ auditId }),
    AuditScoreModel.deleteMany({ auditId }),
  ]);
  await AuditPageModel.deleteMany({ auditId });
}

/** Replaces one active audit's output; partial writes are removed on error. */
export async function replaceAuditResults(input: {
  auditId: string;
  pages: readonly AuditPageResultInput[];
  findings: readonly AuditFindingResultInput[];
  metrics: readonly AuditMetricResultInput[];
  scores: readonly AuditScoreResultInput[];
  discovery?: CrawlDiscoveryInput;
  diagnostics?: readonly AuditPipelineDiagnosticInput[];
}): Promise<boolean> {
  if (!Types.ObjectId.isValid(input.auditId)) return false;
  await connectToDatabase();
  const auditId = new Types.ObjectId(input.auditId);
  const active = await AuditModel.findOne({
    _id: auditId,
    status: { $in: activeAuditStatuses },
  })
    .select({ expiresAt: 1 })
    .lean()
    .exec();
  if (!active) return false;

  await deleteExistingResults(auditId);
  try {
    const pageDocuments =
      input.pages.length > 0
        ? await AuditPageModel.insertMany(
            input.pages.map((page) => ({
              auditId,
              url: page.url,
              normalizedUrl: page.normalizedUrl,
              title: page.title ?? undefined,
              metaDescription: page.metaDescription ?? undefined,
              canonicalUrl: page.canonicalUrl ?? undefined,
              canonicalDeclarations: page.canonicalDeclarations,
              redirectUrl: page.redirectUrl ?? undefined,
              redirectCount: page.redirectCount,
              redirectChain: page.redirectChain,
              fetchErrorCode: page.fetchErrorCode ?? undefined,
              contentType: page.contentType ?? undefined,
              language: page.language ?? undefined,
              robotsDirectives: page.robotsDirectives,
              openGraphTitle: page.openGraphTitle ?? undefined,
              openGraphDescription: page.openGraphDescription ?? undefined,
              openGraphImage: page.openGraphImage ?? undefined,
              twitterCard: page.twitterCard ?? undefined,
              twitterTitle: page.twitterTitle ?? undefined,
              twitterDescription: page.twitterDescription ?? undefined,
              twitterImage: page.twitterImage ?? undefined,
              viewport: page.viewport ?? undefined,
              isIndexable: page.isIndexable,
              headingCount: page.headingCount,
              h1Count: page.h1Count,
              h2Count: page.h2Count,
              h3Count: page.h3Count,
              h4Count: page.h4Count,
              h5Count: page.h5Count,
              h6Count: page.h6Count,
              imageCount: page.imageCount,
              imagesMissingAlt: page.imagesMissingAlt,
              internalLinkCount: page.internalLinkCount,
              externalLinkCount: page.externalLinkCount,
              structuredDataCount: page.structuredDataCount,
              invalidStructuredDataCount: page.invalidStructuredDataCount,
              formCount: page.formCount,
              formControlCount: page.formControlCount,
              labeledFormControlCount: page.labeledFormControlCount,
              labelCount: page.labelCount,
              buttonCount: page.buttonCount,
              scriptCount: page.scriptCount,
              stylesheetCount: page.stylesheetCount,
              iframeCount: page.iframeCount,
              mixedContentResourceCount: page.mixedContentResourceCount,
              metadataTruncatedFields: page.metadataTruncatedFields,
              discoveredVia: page.discoveredVia,
              statusCode: page.statusCode ?? undefined,
              depth: page.depth,
              loadTimeMs: page.loadTimeMs ?? undefined,
              pageSizeBytes: page.pageSizeBytes,
              errorMessage: page.errorMessage,
              crawledAt: new Date(),
              expiresAt: active.expiresAt,
            })),
            { ordered: true },
          )
        : [];
    const pageIdsByUrl = new Map(
      pageDocuments.map((page) => [page.normalizedUrl, page._id]),
    );

    if (input.findings.length > 0) {
      await AuditFindingModel.insertMany(
        input.findings.map((finding) => ({
          auditId,
          ...(finding.affectedUrl && pageIdsByUrl.has(finding.affectedUrl)
            ? { auditPageId: pageIdsByUrl.get(finding.affectedUrl) }
            : {}),
          category: finding.category,
          severity: finding.severity,
          ruleCode: finding.ruleCode,
          title: finding.title,
          description: finding.description,
          affectedUrl: finding.affectedUrl,
          evidence: finding.evidence,
          recommendation: finding.recommendation,
          scoreImpact: finding.scoreImpact,
          affectedPageCount: finding.affectedPageCount,
          evaluatedPageCount: finding.evaluatedPageCount,
          affectedElement: finding.affectedElement,
          occurrences: finding.occurrences ?? 1,
          expiresAt: active.expiresAt,
        })),
        { ordered: true },
      );
    }
    if (input.metrics.length > 0) {
      await AuditMetricModel.insertMany(
        input.metrics.map((metric) => ({
          auditId,
          category: metric.category ?? AuditCategory.SEO,
          key: metric.key,
          value: metric.value,
          unit: metric.unit,
          expiresAt: active.expiresAt,
        })),
        { ordered: true },
      );
    }
    if (input.scores.length > 0) {
      await AuditScoreModel.insertMany(
        input.scores.map((score) => ({
          auditId,
          category: score.category,
          score: score.score,
          evaluated: score.evaluated,
          weight: score.weight,
          evaluatedWeight: score.evaluatedWeight,
          deduction: score.deduction,
          passedCredit: score.passedCredit,
          failingRuleCount: score.failingRuleCount,
          passedRuleCount: score.passedRuleCount,
          expiresAt: active.expiresAt,
        })),
        { ordered: true },
      );
    }

    const overallScore = input.scores.find(
      (score) => score.category === "OVERALL" && score.evaluated,
    );
    const updated = await AuditModel.updateOne(
      {
        _id: auditId,
        status: { $in: activeAuditStatuses },
      },
      {
        $set: {
          ...(input.discovery ? { crawlDiscovery: input.discovery } : {}),
          pipelineDiagnostics: (input.diagnostics ?? []).map((diagnostic) => ({
            ...diagnostic,
            recordedAt: new Date(),
          })),
          ...(overallScore ? { overallScore: overallScore.score } : {}),
        },
        ...(!overallScore ? { $unset: { overallScore: 1 } } : {}),
      },
    );
    if (updated.matchedCount !== 1) {
      await deleteExistingResults(auditId);
      return false;
    }
    return true;
  } catch (error) {
    await deleteExistingResults(auditId);
    throw error;
  }
}

// Retained for compatibility with callers compiled against the SEO-only name.
export const replaceSeoAuditResults = replaceAuditResults;
export type SeoAuditPageInput = AuditPageResultInput;
export type SeoAuditFindingInput = AuditFindingResultInput;
export type SeoAuditMetricInput = AuditMetricResultInput;
