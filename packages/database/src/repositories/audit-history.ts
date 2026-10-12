import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditScoreCategory,
  AuditStatus,
  type AuditStatus as AuditStatusValue,
  type AuditType,
} from "../enums.js";
import { AuditModel, AuditScoreModel, WebsiteModel } from "../models.js";

export const auditHistoryScoreCategories = [
  AuditScoreCategory.OVERALL,
  AuditScoreCategory.SEO,
  AuditScoreCategory.TECHNICAL,
  AuditScoreCategory.PERFORMANCE,
  AuditScoreCategory.ACCESSIBILITY,
  AuditScoreCategory.SECURITY,
  AuditScoreCategory.MOBILE,
] as const;

export type AuditHistoryScoreCategory =
  (typeof auditHistoryScoreCategories)[number];

export type AuditHistoryFilters = {
  websiteId?: string;
  status?: AuditStatusValue;
  type?: AuditType;
  createdFrom?: Date;
  createdBefore?: Date;
  page: number;
  pageSize: number;
};

export type AuditHistoryScoreSet = Record<
  AuditHistoryScoreCategory,
  number | null
>;

export type AuditHistoryItem = {
  id: string;
  website: { id: string; name: string; url: string };
  status: AuditStatusValue;
  type: AuditType;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  pagesCrawled: number;
  scores: AuditHistoryScoreSet;
  overallScoreChange: number | null;
};

export type AuditHistoryTrendPoint = {
  auditId: string;
  completedAt: Date;
  scores: AuditHistoryScoreSet;
};

export type AuditHistoryResult = {
  items: AuditHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  options: {
    websites: Array<{ id: string; name: string }>;
  };
  trend: {
    website: { id: string; name: string } | null;
    points: AuditHistoryTrendPoint[];
  };
};

const emptyScores = (): AuditHistoryScoreSet => ({
  OVERALL: null,
  SEO: null,
  TECHNICAL: null,
  PERFORMANCE: null,
  ACCESSIBILITY: null,
  SECURITY: null,
  MOBILE: null,
});

function emptyResult(pageSize = 20): AuditHistoryResult {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize,
    pageCount: 0,
    options: { websites: [] },
    trend: { website: null, points: [] },
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function calculateDuration(
  startedAt: Date | null | undefined,
  completedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

export function calculateAuditScoreChange(
  currentScore: number | null,
  previousScore: number | null,
): number | null {
  return currentScore === null || previousScore === null
    ? null
    : currentScore - previousScore;
}

function buildScores(
  auditId: string,
  scoresByAudit: ReadonlyMap<
    string,
    ReadonlyMap<AuditHistoryScoreCategory, number>
  >,
): AuditHistoryScoreSet {
  const scores = emptyScores();
  const stored = scoresByAudit.get(auditId);
  if (!stored) return scores;
  for (const category of auditHistoryScoreCategories) {
    scores[category] = stored.get(category) ?? null;
  }
  return scores;
}

async function loadScoresByAudit(
  auditIds: readonly Types.ObjectId[],
): Promise<Map<string, Map<AuditHistoryScoreCategory, number>>> {
  if (auditIds.length === 0) return new Map();
  const scoreDocuments = await AuditScoreModel.find({
    auditId: { $in: auditIds },
    category: { $in: auditHistoryScoreCategories },
    evaluated: true,
  })
    .select({ auditId: 1, category: 1, score: 1 })
    .lean()
    .exec();
  const scoresByAudit = new Map<
    string,
    Map<AuditHistoryScoreCategory, number>
  >();
  for (const score of scoreDocuments) {
    const auditId = score.auditId.toString();
    const scores = scoresByAudit.get(auditId) ?? new Map();
    scores.set(score.category as AuditHistoryScoreCategory, score.score);
    scoresByAudit.set(auditId, scores);
  }
  return scoresByAudit;
}

/**
 * Loads the previous completed overall score for the displayed audits in one
 * database operation. This avoids one historical lookup for every row in an
 * audit-history page.
 */
async function loadPreviousOverallScores(input: {
  workspaceId: Types.ObjectId;
  audits: ReadonlyArray<{
    id: Types.ObjectId;
    websiteId: Types.ObjectId;
    createdAt: Date;
  }>;
}): Promise<Map<string, number>> {
  if (input.audits.length === 0) return new Map();

  const targetAuditIds = input.audits.map((audit) => audit.id);
  const rows = await AuditModel.aggregate<{
    _id: Types.ObjectId;
    previous: Array<{ overallScore?: number }>;
  }>([
    { $match: { _id: { $in: targetAuditIds } } },
    {
      $lookup: {
        from: AuditModel.collection.name,
        let: {
          currentWebsiteId: "$websiteId",
          currentCreatedAt: "$createdAt",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$workspaceId", input.workspaceId] },
                  { $eq: ["$websiteId", "$$currentWebsiteId"] },
                  { $eq: ["$status", AuditStatus.COMPLETED] },
                  { $lt: ["$createdAt", "$$currentCreatedAt"] },
                ],
              },
              overallScore: { $type: "number" },
            },
          },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { overallScore: 1 } },
        ],
        as: "previous",
      },
    },
    { $project: { previous: 1 } },
  ]).exec();

  const scores = new Map<string, number>();
  for (const row of rows) {
    const previousScore = row.previous[0]?.overallScore;
    if (typeof previousScore === "number") {
      scores.set(row._id.toString(), previousScore);
    }
  }
  return scores;
}

/** Lists workspace-authorized audits and derives real history from stored scores. */
export async function listAuditHistoryForWorkspace(input: {
  workspaceId: string;
  filters: AuditHistoryFilters;
}): Promise<AuditHistoryResult> {
  const pageSize = clampInteger(input.filters.pageSize, 10, 100);
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    (input.filters.websiteId &&
      !Types.ObjectId.isValid(input.filters.websiteId))
  ) {
    return emptyResult(pageSize);
  }

  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const websiteId = input.filters.websiteId
    ? new Types.ObjectId(input.filters.websiteId)
    : undefined;
  const createdAt =
    input.filters.createdFrom || input.filters.createdBefore
      ? {
          ...(input.filters.createdFrom
            ? { $gte: input.filters.createdFrom }
            : {}),
          ...(input.filters.createdBefore
            ? { $lt: input.filters.createdBefore }
            : {}),
        }
      : undefined;
  const auditFilter = {
    workspaceId,
    ...(websiteId ? { websiteId } : {}),
    ...(input.filters.status ? { status: input.filters.status } : {}),
    ...(input.filters.type ? { type: input.filters.type } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const page = clampInteger(input.filters.page, 1, 10_000);
  const [total, websites] = await Promise.all([
    AuditModel.countDocuments(auditFilter).exec(),
    WebsiteModel.find({ workspaceId })
      .select({ name: 1, url: 1 })
      .sort({ name: 1, url: 1 })
      .lean()
      .exec(),
  ]);
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  const boundedPage = Math.min(page, Math.max(1, pageCount));
  const audits = await AuditModel.find(auditFilter)
    .select({
      websiteId: 1,
      status: 1,
      type: 1,
      pagesCrawled: 1,
      overallScore: 1,
      startedAt: 1,
      completedAt: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1, _id: -1 })
    .skip((boundedPage - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  const websiteById = new Map(
    websites.map((website) => [
      website._id.toString(),
      {
        id: website._id.toString(),
        name: website.name?.trim() || website.url,
        url: website.url,
      },
    ]),
  );
  const scoresByAudit = await loadScoresByAudit(
    audits.map((audit) => audit._id),
  );

  const previousOverallScores = await loadPreviousOverallScores({
    workspaceId,
    audits: audits
      .filter(
        (audit) =>
          audit.status === AuditStatus.COMPLETED &&
          buildScores(audit._id.toString(), scoresByAudit).OVERALL !== null,
      )
      .map((audit) => ({
        id: audit._id,
        websiteId: audit.websiteId,
        createdAt: audit.createdAt,
      })),
  });

  let trendWebsiteId = websiteId;
  if (!trendWebsiteId) {
    const latestCompleted = await AuditModel.findOne({
      workspaceId,
      status: AuditStatus.COMPLETED,
      overallScore: { $type: "number" },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select({ websiteId: 1 })
      .lean()
      .exec();
    trendWebsiteId = latestCompleted?.websiteId;
  }
  const trendAudits = trendWebsiteId
    ? await AuditModel.find({
        workspaceId,
        websiteId: trendWebsiteId,
        status: AuditStatus.COMPLETED,
      })
        .select({ completedAt: 1, createdAt: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .limit(30)
        .lean()
        .exec()
    : [];
  trendAudits.reverse();
  const trendScores = await loadScoresByAudit(
    trendAudits.map((audit) => audit._id),
  );
  const trendWebsite = trendWebsiteId
    ? websiteById.get(trendWebsiteId.toString())
    : undefined;

  return {
    items: audits.map((audit) => {
      const auditId = audit._id.toString();
      const scores =
        audit.status === AuditStatus.COMPLETED
          ? buildScores(auditId, scoresByAudit)
          : emptyScores();
      const previousOverall = previousOverallScores.get(auditId);
      const website = websiteById.get(audit.websiteId.toString());
      return {
        id: auditId,
        website: website ?? {
          id: audit.websiteId.toString(),
          name: "Unavailable website",
          url: "",
        },
        status: audit.status,
        type: audit.type,
        createdAt: audit.createdAt,
        startedAt: audit.startedAt ?? null,
        completedAt: audit.completedAt ?? null,
        durationMs: calculateDuration(audit.startedAt, audit.completedAt),
        pagesCrawled: audit.pagesCrawled ?? 0,
        scores,
        overallScoreChange: calculateAuditScoreChange(
          scores.OVERALL,
          previousOverall ?? null,
        ),
      };
    }),
    total,
    page: boundedPage,
    pageSize,
    pageCount,
    options: {
      websites: websites.map((website) => ({
        id: website._id.toString(),
        name: website.name?.trim() || website.url,
      })),
    },
    trend: {
      website: trendWebsite
        ? { id: trendWebsite.id, name: trendWebsite.name }
        : null,
      points: trendAudits.map((audit) => ({
        auditId: audit._id.toString(),
        completedAt: audit.completedAt ?? audit.createdAt,
        scores: buildScores(audit._id.toString(), trendScores),
      })),
    },
  };
}
