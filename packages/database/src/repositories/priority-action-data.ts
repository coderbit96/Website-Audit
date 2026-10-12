import { Types } from "mongoose";

import type {
  AuditCategory as AuditCategoryValue,
  FindingSeverity as FindingSeverityValue,
} from "../enums.js";
import { FindingSeverity } from "../enums.js";
import { AuditFindingModel } from "../models.js";

const maximumSourceFindings = 5_000;

export type PriorityActionFindingRecord = {
  ruleCode: string;
  category: AuditCategoryValue;
  severity: FindingSeverityValue;
  title: string;
  recommendation: string;
  affectedUrl: string | null;
  scoreImpact: number;
  affectedPageCount: number;
  evaluatedPageCount: number;
};

export type PriorityActionFindingSet = {
  findings: PriorityActionFindingRecord[];
  truncated: boolean;
};

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Readonly<Record<string, unknown>>;
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function evidenceUrlCount(evidence: Readonly<Record<string, unknown>>): number {
  if (!Array.isArray(evidence.affectedUrls)) return 0;
  return new Set(
    evidence.affectedUrls.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  ).size;
}

/** Loads a bounded, client-safe projection for deterministic prioritization. */
export async function getPriorityActionFindings(
  auditId: Types.ObjectId,
  totalPageCount: number,
): Promise<PriorityActionFindingSet> {
  const source = await AuditFindingModel.find({
    auditId,
    severity: { $ne: FindingSeverity.PASSED },
  })
    .select({
      ruleCode: 1,
      category: 1,
      severity: 1,
      title: 1,
      recommendation: 1,
      affectedUrl: 1,
      scoreImpact: 1,
      affectedPageCount: 1,
      evaluatedPageCount: 1,
      evidence: 1,
    })
    .sort({ scoreImpact: -1, ruleCode: 1, affectedUrl: 1 })
    .limit(maximumSourceFindings + 1)
    .lean()
    .exec();
  const truncated = source.length > maximumSourceFindings;
  const fallbackEvaluatedPageCount = Math.max(1, Math.floor(totalPageCount));

  return {
    truncated,
    findings: source.slice(0, maximumSourceFindings).map((finding) => {
      const evidence = asRecord(finding.evidence);
      const evaluatedPageCount = Math.max(
        1,
        finiteCount(finding.evaluatedPageCount) ?? fallbackEvaluatedPageCount,
      );
      const explicitAffectedPageCount =
        finiteCount(finding.affectedPageCount) ??
        finiteCount(evidence.affectedPageCount) ??
        finiteCount(evidence.affectedUrlCount);
      const inferredAffectedPageCount = Math.max(
        evidenceUrlCount(evidence),
        finding.affectedUrl ? 1 : 0,
      );
      const affectedPageCount = Math.min(
        evaluatedPageCount,
        explicitAffectedPageCount ??
          (inferredAffectedPageCount > 0
            ? inferredAffectedPageCount
            : evaluatedPageCount),
      );

      return {
        ruleCode: finding.ruleCode,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        recommendation: finding.recommendation,
        affectedUrl: finding.affectedUrl ?? null,
        scoreImpact: finding.scoreImpact,
        affectedPageCount,
        evaluatedPageCount,
      };
    }),
  };
}
