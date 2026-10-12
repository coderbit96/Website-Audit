import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditCategory,
  type AuditCategory as AuditCategoryValue,
  type AuditType,
  FindingSeverity,
  type FindingSeverity as FindingSeverityValue,
  type FindingStatus,
} from "../enums.js";
import {
  AuditFindingModel,
  AuditModel,
  AuditPageModel,
  WebsiteModel,
} from "../models.js";

type PageContext = {
  audit: { id: string; type: AuditType; createdAt: Date };
  website: { id: string; name: string; url: string };
};

export type PageExplorerItem = {
  id: string;
  url: string;
  title: string | null;
  statusCode: number | null;
  indexable: boolean | null;
  depth: number;
  responseTimeMs: number | null;
  pageSizeBytes: number | null;
  seoIssueCount: number;
  technicalIssueCount: number;
};

export type PageExplorerResult = PageContext & {
  pages: PageExplorerItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type PageDetailFinding = {
  id: string;
  category: AuditCategoryValue;
  severity: FindingSeverityValue;
  status: FindingStatus;
  ruleCode: string;
  title: string;
  description: string;
  evidence: unknown;
  recommendation: string;
  scoreImpact: number;
  occurrences: number;
};

export type PageDetailResult = PageContext & {
  page: {
    id: string;
    url: string;
    normalizedUrl: string;
    title: string | null;
    metaDescription: string | null;
    canonicalUrl: string | null;
    canonicalDeclarations: string[];
    redirectUrl: string | null;
    redirectCount: number;
    redirectChain: Array<{
      sourceUrl: string;
      statusCode: number;
      destinationUrl: string;
    }>;
    fetchErrorCode: string | null;
    contentType: string | null;
    language: string | null;
    robotsDirectives: string[];
    openGraphTitle: string | null;
    openGraphDescription: string | null;
    openGraphImage: string | null;
    twitterCard: string | null;
    twitterTitle: string | null;
    twitterDescription: string | null;
    twitterImage: string | null;
    viewport: string | null;
    indexable: boolean | null;
    headingCount: number | null;
    h1Count: number | null;
    h2Count: number | null;
    h3Count: number | null;
    h4Count: number | null;
    h5Count: number | null;
    h6Count: number | null;
    imageCount: number | null;
    imagesMissingAlt: number | null;
    internalLinkCount: number | null;
    externalLinkCount: number | null;
    structuredDataCount: number | null;
    invalidStructuredDataCount: number | null;
    formCount: number | null;
    formControlCount: number | null;
    labeledFormControlCount: number | null;
    labelCount: number | null;
    buttonCount: number | null;
    scriptCount: number | null;
    stylesheetCount: number | null;
    iframeCount: number | null;
    mixedContentResourceCount: number | null;
    metadataTruncatedFields: string[];
    discoveredVia: "ROOT" | "LINK" | "SITEMAP" | null;
    statusCode: number | null;
    depth: number;
    responseTimeMs: number | null;
    pageSizeBytes: number | null;
    errorMessage: string | null;
    crawledAt: Date | null;
  };
  findings: PageDetailFinding[];
  findingTotal: number;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

async function getPageContext(
  workspaceId: string,
  auditId: string,
): Promise<
  | (PageContext & {
      auditObjectId: Types.ObjectId;
    })
  | null
> {
  if (
    !Types.ObjectId.isValid(workspaceId) ||
    !Types.ObjectId.isValid(auditId)
  ) {
    return null;
  }
  const audit = await AuditModel.findOne({ _id: auditId, workspaceId })
    .select({ websiteId: 1, type: 1, createdAt: 1 })
    .lean()
    .exec();
  if (!audit) return null;

  const website = await WebsiteModel.findOne({
    _id: audit.websiteId,
    workspaceId,
  })
    .select({ name: 1, url: 1 })
    .lean()
    .exec();
  if (!website) return null;

  return {
    auditObjectId: audit._id,
    audit: {
      id: audit._id.toString(),
      type: audit.type,
      createdAt: audit.createdAt,
    },
    website: {
      id: website._id.toString(),
      name: website.name?.trim() || website.url,
      url: website.url,
    },
  };
}

export async function listAuditPagesForWorkspace(input: {
  workspaceId: string;
  auditId: string;
  page: number;
  pageSize?: number;
  search?: string;
}): Promise<PageExplorerResult | null> {
  await connectToDatabase();
  const context = await getPageContext(input.workspaceId, input.auditId);
  if (!context) return null;

  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 25));
  const pageFilter: Record<string, unknown> = {
    auditId: context.auditObjectId,
  };
  if (input.search) {
    const expression = new RegExp(escapeRegex(input.search), "i");
    pageFilter.$or = [
      { url: expression },
      { normalizedUrl: expression },
      { title: expression },
    ];
  }

  const total = await AuditPageModel.countDocuments(pageFilter).exec();
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, input.page), Math.max(1, pageCount));
  const pageDocuments = await AuditPageModel.find(pageFilter)
    .sort({ depth: 1, normalizedUrl: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  const pageIds = pageDocuments.map((item) => item._id);
  const categoryCounts =
    pageIds.length === 0
      ? []
      : await AuditFindingModel.aggregate<{
          _id: { auditPageId: Types.ObjectId; category: AuditCategoryValue };
          count: number;
        }>([
          {
            $match: {
              auditId: context.auditObjectId,
              auditPageId: { $in: pageIds },
              category: {
                $in: [AuditCategory.SEO, AuditCategory.TECHNICAL],
              },
              severity: { $ne: FindingSeverity.PASSED },
            },
          },
          {
            $group: {
              _id: { auditPageId: "$auditPageId", category: "$category" },
              count: { $sum: 1 },
            },
          },
        ]).exec();
  const countsByPage = new Map<string, { SEO: number; TECHNICAL: number }>();
  for (const group of categoryCounts) {
    const key = group._id.auditPageId.toString();
    const counts = countsByPage.get(key) ?? { SEO: 0, TECHNICAL: 0 };
    if (group._id.category === AuditCategory.SEO) counts.SEO = group.count;
    if (group._id.category === AuditCategory.TECHNICAL) {
      counts.TECHNICAL = group.count;
    }
    countsByPage.set(key, counts);
  }

  return {
    audit: context.audit,
    website: context.website,
    total,
    page,
    pageSize,
    pageCount,
    pages: pageDocuments.map((item) => {
      const counts = countsByPage.get(item._id.toString()) ?? {
        SEO: 0,
        TECHNICAL: 0,
      };
      return {
        id: item._id.toString(),
        url: item.url,
        title: item.title ?? null,
        statusCode: nullableNumber(item.statusCode),
        indexable:
          typeof item.isIndexable === "boolean" ? item.isIndexable : null,
        depth: item.depth,
        responseTimeMs: nullableNumber(item.loadTimeMs),
        pageSizeBytes: nullableNumber(item.pageSizeBytes),
        seoIssueCount: counts.SEO,
        technicalIssueCount: counts.TECHNICAL,
      };
    }),
  };
}

export async function getAuditPageDetailForWorkspace(input: {
  workspaceId: string;
  auditId: string;
  pageId: string;
}): Promise<PageDetailResult | null> {
  if (!Types.ObjectId.isValid(input.pageId)) return null;
  await connectToDatabase();
  const context = await getPageContext(input.workspaceId, input.auditId);
  if (!context) return null;

  const page = await AuditPageModel.findOne({
    _id: input.pageId,
    auditId: context.auditObjectId,
  })
    .lean()
    .exec();
  if (!page) return null;

  const findingFilter = {
    auditId: context.auditObjectId,
    $or: [
      { auditPageId: page._id },
      { affectedUrl: { $in: [page.url, page.normalizedUrl] } },
    ],
  };
  const [findings, findingTotal] = await Promise.all([
    AuditFindingModel.find(findingFilter)
      .sort({ scoreImpact: -1, createdAt: 1 })
      .limit(250)
      .lean()
      .exec(),
    AuditFindingModel.countDocuments(findingFilter).exec(),
  ]);

  return {
    audit: context.audit,
    website: context.website,
    page: {
      id: page._id.toString(),
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      title: page.title ?? null,
      metaDescription: page.metaDescription ?? null,
      canonicalUrl: page.canonicalUrl ?? null,
      canonicalDeclarations: [...(page.canonicalDeclarations ?? [])],
      redirectUrl: page.redirectUrl ?? null,
      redirectCount: page.redirectCount ?? 0,
      redirectChain: (page.redirectChain ?? []).map(
        (redirect: {
          sourceUrl: string;
          statusCode: number;
          destinationUrl: string;
        }) => ({
          sourceUrl: redirect.sourceUrl,
          statusCode: redirect.statusCode,
          destinationUrl: redirect.destinationUrl,
        }),
      ),
      fetchErrorCode: page.fetchErrorCode ?? null,
      contentType: page.contentType ?? null,
      language: page.language ?? null,
      robotsDirectives: [...(page.robotsDirectives ?? [])],
      openGraphTitle: page.openGraphTitle ?? null,
      openGraphDescription: page.openGraphDescription ?? null,
      openGraphImage: page.openGraphImage ?? null,
      twitterCard: page.twitterCard ?? null,
      twitterTitle: page.twitterTitle ?? null,
      twitterDescription: page.twitterDescription ?? null,
      twitterImage: page.twitterImage ?? null,
      viewport: page.viewport ?? null,
      indexable:
        typeof page.isIndexable === "boolean" ? page.isIndexable : null,
      headingCount: nullableNumber(page.headingCount),
      h1Count: nullableNumber(page.h1Count),
      h2Count: nullableNumber(page.h2Count),
      h3Count: nullableNumber(page.h3Count),
      h4Count: nullableNumber(page.h4Count),
      h5Count: nullableNumber(page.h5Count),
      h6Count: nullableNumber(page.h6Count),
      imageCount: nullableNumber(page.imageCount),
      imagesMissingAlt: nullableNumber(page.imagesMissingAlt),
      internalLinkCount: nullableNumber(page.internalLinkCount),
      externalLinkCount: nullableNumber(page.externalLinkCount),
      structuredDataCount: nullableNumber(page.structuredDataCount),
      invalidStructuredDataCount: nullableNumber(
        page.invalidStructuredDataCount,
      ),
      formCount: nullableNumber(page.formCount),
      formControlCount: nullableNumber(page.formControlCount),
      labeledFormControlCount: nullableNumber(page.labeledFormControlCount),
      labelCount: nullableNumber(page.labelCount),
      buttonCount: nullableNumber(page.buttonCount),
      scriptCount: nullableNumber(page.scriptCount),
      stylesheetCount: nullableNumber(page.stylesheetCount),
      iframeCount: nullableNumber(page.iframeCount),
      mixedContentResourceCount: nullableNumber(page.mixedContentResourceCount),
      metadataTruncatedFields: [...(page.metadataTruncatedFields ?? [])],
      discoveredVia: page.discoveredVia ?? null,
      statusCode: nullableNumber(page.statusCode),
      depth: page.depth,
      responseTimeMs: nullableNumber(page.loadTimeMs),
      pageSizeBytes: nullableNumber(page.pageSizeBytes),
      errorMessage: page.errorMessage ?? null,
      crawledAt: page.crawledAt ?? null,
    },
    findings: findings.map((finding) => ({
      id: finding._id.toString(),
      category: finding.category,
      severity: finding.severity,
      status: finding.status,
      ruleCode: finding.ruleCode,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
      recommendation: finding.recommendation,
      scoreImpact: finding.scoreImpact,
      occurrences: finding.occurrences ?? 1,
    })),
    findingTotal,
  };
}
