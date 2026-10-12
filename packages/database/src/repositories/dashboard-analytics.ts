import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import { AuditStatus, FindingSeverity, FindingStatus } from "../enums.js";
import { AuditFindingModel, AuditModel, WebsiteModel } from "../models.js";

export type DashboardIssueCountRow = {
  severity: string;
  status: string;
  count: number;
};

export type DashboardIssueCounts = {
  critical: number;
  warnings: number;
  resolved: number;
};

export type WorkspaceDashboardAnalytics = {
  websiteCount: number;
  auditCount: number;
  averageHealthScore: number | null;
  issueCounts: DashboardIssueCounts;
};

const emptyIssueCounts = (): DashboardIssueCounts => ({
  critical: 0,
  warnings: 0,
  resolved: 0,
});

/**
 * Counts issue workflow state from each website's latest completed audit.
 * Historical audit findings are intentionally excluded so re-auditing a site
 * cannot inflate the overview with the same issue repeatedly.
 */
export function summarizeDashboardIssueCounts(
  rows: readonly DashboardIssueCountRow[],
): DashboardIssueCounts {
  return rows.reduce<DashboardIssueCounts>((counts, row) => {
    const count = Number.isFinite(row.count) ? Math.max(0, row.count) : 0;
    const isActive =
      row.status === FindingStatus.OPEN ||
      row.status === FindingStatus.REOPENED;

    if (isActive && row.severity === FindingSeverity.CRITICAL) {
      counts.critical += count;
    }
    if (isActive && row.severity === FindingSeverity.WARNING) {
      counts.warnings += count;
    }
    if (row.status === FindingStatus.FIXED) {
      counts.resolved += count;
    }
    return counts;
  }, emptyIssueCounts());
}

function emptyAnalytics(): WorkspaceDashboardAnalytics {
  return {
    websiteCount: 0,
    auditCount: 0,
    averageHealthScore: null,
    issueCounts: emptyIssueCounts(),
  };
}

/** Returns only workspace-scoped, stored dashboard summary data. */
export async function getWorkspaceDashboardAnalytics(input: {
  workspaceId: string;
}): Promise<WorkspaceDashboardAnalytics> {
  if (!Types.ObjectId.isValid(input.workspaceId)) return emptyAnalytics();

  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const completedAuditFilter = {
    workspaceId,
    status: AuditStatus.COMPLETED,
  };

  const [websiteCount, auditCount, averageScoreRows, latestAuditRows] =
    await Promise.all([
      WebsiteModel.countDocuments({ workspaceId }).exec(),
      AuditModel.countDocuments({ workspaceId }).exec(),
      AuditModel.aggregate<{ average: number }>([
        {
          $match: {
            ...completedAuditFilter,
            overallScore: { $type: "number" },
          },
        },
        { $group: { _id: null, average: { $avg: "$overallScore" } } },
      ]).exec(),
      AuditModel.aggregate<{ auditId: Types.ObjectId }>([
        { $match: completedAuditFilter },
        { $sort: { websiteId: 1, completedAt: -1, createdAt: -1, _id: -1 } },
        { $group: { _id: "$websiteId", auditId: { $first: "$_id" } } },
      ]).exec(),
    ]);

  const latestAuditIds = latestAuditRows.map((row) => row.auditId);
  const issueRows =
    latestAuditIds.length === 0
      ? []
      : await AuditFindingModel.aggregate<DashboardIssueCountRow>([
          { $match: { auditId: { $in: latestAuditIds } } },
          {
            $group: {
              _id: { severity: "$severity", status: "$status" },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              severity: "$_id.severity",
              status: "$_id.status",
              count: 1,
            },
          },
        ]).exec();
  const average = averageScoreRows[0]?.average;

  return {
    websiteCount,
    auditCount,
    averageHealthScore:
      typeof average === "number" ? Math.round(average * 10) / 10 : null,
    issueCounts: summarizeDashboardIssueCounts(issueRows),
  };
}
