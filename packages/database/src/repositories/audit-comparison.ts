import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  AuditScoreCategory,
  AuditStatus,
  FindingSeverity,
  type AuditCategory as AuditCategoryValue,
  type AuditScoreCategory as AuditScoreCategoryValue,
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

const comparisonScoreCategories = [
  AuditScoreCategory.OVERALL,
  AuditScoreCategory.SEO,
  AuditScoreCategory.TECHNICAL,
  AuditScoreCategory.PERFORMANCE,
  AuditScoreCategory.ACCESSIBILITY,
  AuditScoreCategory.SECURITY,
  AuditScoreCategory.MOBILE,
] as const;

const severityRank: Record<FindingSeverityValue, number> = {
  [FindingSeverity.PASSED]: 0,
  [FindingSeverity.RECOMMENDATION]: 1,
  [FindingSeverity.WARNING]: 2,
  [FindingSeverity.CRITICAL]: 3,
};

export type AuditComparisonScoreSet = Record<
  AuditScoreCategoryValue,
  number | null
>;

export type ComparableFinding = {
  ruleCode: string;
  category: AuditCategoryValue;
  severity: FindingSeverityValue;
  title: string;
  affectedUrl: string | null;
  occurrences: number;
};

export type AuditFindingComparisonState =
  "NEW" | "EXISTING" | "RESOLVED" | "REGRESSION";

export type AuditFindingComparison = {
  identity: string;
  state: AuditFindingComparisonState;
  ruleCode: string;
  category: AuditCategoryValue;
  title: string;
  affectedUrl: string | null;
  previousSeverity: FindingSeverityValue | null;
  currentSeverity: FindingSeverityValue | null;
  previousOccurrences: number;
  currentOccurrences: number;
};

export type AuditFindingComparisonResult = {
  counts: Record<AuditFindingComparisonState, number>;
  previews: Record<AuditFindingComparisonState, AuditFindingComparison[]>;
  previewLimit: number;
};

export type AuditPageComparisonResult = {
  added: Array<{ normalizedUrl: string; url: string }>;
  removed: Array<{ normalizedUrl: string; url: string }>;
};

export type AuditComparisonRecord = {
  website: { id: string; name: string; url: string };
  auditA: {
    id: string;
    type: AuditTypeValue;
    createdAt: Date;
    completedAt: Date;
    pagesCrawled: number;
    scores: AuditComparisonScoreSet;
    criticalIssues: number;
    warnings: number;
  };
  auditB: {
    id: string;
    type: AuditTypeValue;
    createdAt: Date;
    completedAt: Date;
    pagesCrawled: number;
    scores: AuditComparisonScoreSet;
    criticalIssues: number;
    warnings: number;
  };
  findings: AuditFindingComparisonResult;
  pages: AuditPageComparisonResult;
};

export type AuditComparisonResult = {
  options: {
    websites: Array<{ id: string; name: string }>;
    audits: Array<{
      id: string;
      type: AuditTypeValue;
      createdAt: Date;
      completedAt: Date;
    }>;
    auditTotal: number;
    auditOptionsTruncated: boolean;
  };
  selectionError: string | null;
  comparison: AuditComparisonRecord | null;
};

type GroupedFinding = Omit<ComparableFinding, "occurrences"> & {
  identity: string;
  occurrences: number;
};

function emptyScores(): AuditComparisonScoreSet {
  return {
    OVERALL: null,
    SEO: null,
    TECHNICAL: null,
    PERFORMANCE: null,
    ACCESSIBILITY: null,
    SECURITY: null,
    MOBILE: null,
  };
}

export function normalizeComparisonUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const sortedParameters = [...parsed.searchParams.entries()].sort(
      ([firstKey, firstValue], [secondKey, secondValue]) =>
        firstKey.localeCompare(secondKey) ||
        firstValue.localeCompare(secondValue),
    );
    parsed.search = "";
    for (const [key, parameterValue] of sortedParameters) {
      parsed.searchParams.append(key, parameterValue);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function createFindingIdentity(
  ruleCode: string,
  affectedUrl: string | null,
): string {
  return `${ruleCode.trim().toUpperCase()}\u0000${normalizeComparisonUrl(affectedUrl) ?? "__SITE_WIDE__"}`;
}

function groupFindings(
  findings: readonly ComparableFinding[],
): Map<string, GroupedFinding> {
  const grouped = new Map<string, GroupedFinding>();
  for (const finding of findings) {
    if (finding.severity === FindingSeverity.PASSED) continue;
    const identity = createFindingIdentity(
      finding.ruleCode,
      finding.affectedUrl,
    );
    const existing = grouped.get(identity);
    if (!existing) {
      grouped.set(identity, {
        ...finding,
        identity,
        ruleCode: finding.ruleCode.trim().toUpperCase(),
        affectedUrl: normalizeComparisonUrl(finding.affectedUrl),
        occurrences: Math.max(1, finding.occurrences),
      });
      continue;
    }
    existing.occurrences += Math.max(1, finding.occurrences);
    if (severityRank[finding.severity] > severityRank[existing.severity]) {
      existing.severity = finding.severity;
      existing.category = finding.category;
      existing.title = finding.title;
    }
  }
  return grouped;
}

function findingSort(
  first: AuditFindingComparison,
  second: AuditFindingComparison,
): number {
  const firstSeverity =
    first.currentSeverity ?? first.previousSeverity ?? FindingSeverity.PASSED;
  const secondSeverity =
    second.currentSeverity ?? second.previousSeverity ?? FindingSeverity.PASSED;
  return (
    severityRank[secondSeverity] - severityRank[firstSeverity] ||
    first.ruleCode.localeCompare(second.ruleCode) ||
    (first.affectedUrl ?? "").localeCompare(second.affectedUrl ?? "")
  );
}

export function compareAuditFindings(
  auditA: readonly ComparableFinding[],
  auditB: readonly ComparableFinding[],
  requestedPreviewLimit = 50,
): AuditFindingComparisonResult {
  const previewLimit = Number.isInteger(requestedPreviewLimit)
    ? Math.max(1, Math.min(requestedPreviewLimit, 100))
    : 50;
  const baseline = groupFindings(auditA);
  const current = groupFindings(auditB);
  const allIdentities = new Set([...baseline.keys(), ...current.keys()]);
  const comparisons: AuditFindingComparison[] = [];

  for (const identity of allIdentities) {
    const previous = baseline.get(identity);
    const next = current.get(identity);
    let state: AuditFindingComparisonState;
    if (!previous && next) state = "NEW";
    else if (previous && !next) state = "RESOLVED";
    else if (
      previous &&
      next &&
      (severityRank[next.severity] > severityRank[previous.severity] ||
        next.occurrences > previous.occurrences)
    ) {
      state = "REGRESSION";
    } else {
      state = "EXISTING";
    }

    const representative = next ?? previous;
    if (!representative) continue;
    comparisons.push({
      identity,
      state,
      ruleCode: representative.ruleCode,
      category: representative.category,
      title: representative.title,
      affectedUrl: representative.affectedUrl,
      previousSeverity: previous?.severity ?? null,
      currentSeverity: next?.severity ?? null,
      previousOccurrences: previous?.occurrences ?? 0,
      currentOccurrences: next?.occurrences ?? 0,
    });
  }

  const states: readonly AuditFindingComparisonState[] = [
    "NEW",
    "EXISTING",
    "RESOLVED",
    "REGRESSION",
  ];
  const counts = { NEW: 0, EXISTING: 0, RESOLVED: 0, REGRESSION: 0 };
  const previews: AuditFindingComparisonResult["previews"] = {
    NEW: [],
    EXISTING: [],
    RESOLVED: [],
    REGRESSION: [],
  };
  for (const state of states) {
    const matching = comparisons
      .filter((comparison) => comparison.state === state)
      .sort(findingSort);
    counts[state] = matching.length;
    previews[state] = matching.slice(0, previewLimit);
  }
  return { counts, previews, previewLimit };
}

export function compareAuditPages(
  auditA: readonly { normalizedUrl: string; url: string }[],
  auditB: readonly { normalizedUrl: string; url: string }[],
): AuditPageComparisonResult {
  const baseline = new Map(
    auditA.map((page) => [normalizeComparisonUrl(page.normalizedUrl), page]),
  );
  const current = new Map(
    auditB.map((page) => [normalizeComparisonUrl(page.normalizedUrl), page]),
  );
  const added = [...current.entries()]
    .filter(([identity]) => !baseline.has(identity))
    .map(([identity, page]) => ({
      normalizedUrl: identity ?? page.normalizedUrl,
      url: page.url,
    }));
  const removed = [...baseline.entries()]
    .filter(([identity]) => !current.has(identity))
    .map(([identity, page]) => ({
      normalizedUrl: identity ?? page.normalizedUrl,
      url: page.url,
    }));
  return {
    added: added.sort((first, second) =>
      first.normalizedUrl.localeCompare(second.normalizedUrl),
    ),
    removed: removed.sort((first, second) =>
      first.normalizedUrl.localeCompare(second.normalizedUrl),
    ),
  };
}

function countSeverity(
  findings: readonly ComparableFinding[],
  severity: FindingSeverityValue,
): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function buildScoreSets(
  scores: readonly {
    auditId: Types.ObjectId;
    category: AuditScoreCategoryValue;
    score: number;
    evaluated: boolean;
  }[],
): Map<string, AuditComparisonScoreSet> {
  const sets = new Map<string, AuditComparisonScoreSet>();
  for (const score of scores) {
    const auditId = score.auditId.toString();
    const set = sets.get(auditId) ?? emptyScores();
    if (score.evaluated) set[score.category] = score.score;
    sets.set(auditId, set);
  }
  return sets;
}

export async function getAuditComparisonForWorkspace(input: {
  workspaceId: string;
  websiteId?: string;
  auditAId?: string;
  auditBId?: string;
}): Promise<AuditComparisonResult> {
  const emptyResult: AuditComparisonResult = {
    options: {
      websites: [],
      audits: [],
      auditTotal: 0,
      auditOptionsTruncated: false,
    },
    selectionError: null,
    comparison: null,
  };
  if (!Types.ObjectId.isValid(input.workspaceId)) return emptyResult;

  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const websites = await WebsiteModel.find({ workspaceId })
    .select({ name: 1, url: 1 })
    .sort({ name: 1, url: 1 })
    .lean()
    .exec();
  emptyResult.options.websites = websites.map((website) => ({
    id: website._id.toString(),
    name: website.name?.trim() || website.url,
  }));

  if (!input.websiteId || !Types.ObjectId.isValid(input.websiteId)) {
    return emptyResult;
  }
  const website = websites.find(
    (candidate) => candidate._id.toString() === input.websiteId,
  );
  if (!website) {
    return {
      ...emptyResult,
      selectionError: "The selected website is unavailable.",
    };
  }

  const websiteId = website._id;
  const auditFilter = {
    workspaceId,
    websiteId,
    status: AuditStatus.COMPLETED,
  };
  const auditOptionLimit = 200;
  const [auditTotal, auditOptions] = await Promise.all([
    AuditModel.countDocuments(auditFilter).exec(),
    AuditModel.find(auditFilter)
      .select({ type: 1, createdAt: 1, completedAt: 1 })
      .sort({ completedAt: -1, createdAt: -1, _id: -1 })
      .limit(auditOptionLimit)
      .lean()
      .exec(),
  ]);
  emptyResult.options.audits = auditOptions.map((audit) => ({
    id: audit._id.toString(),
    type: audit.type,
    createdAt: audit.createdAt,
    completedAt: audit.completedAt ?? audit.createdAt,
  }));
  emptyResult.options.auditTotal = auditTotal;
  emptyResult.options.auditOptionsTruncated = auditTotal > auditOptionLimit;

  if (!input.auditAId && !input.auditBId) return emptyResult;
  if (!input.auditAId || !input.auditBId) {
    return {
      ...emptyResult,
      selectionError: "Choose both a baseline audit and a comparison audit.",
    };
  }
  if (
    !Types.ObjectId.isValid(input.auditAId) ||
    !Types.ObjectId.isValid(input.auditBId) ||
    input.auditAId === input.auditBId
  ) {
    return {
      ...emptyResult,
      selectionError: "Choose two different completed audits.",
    };
  }

  const selectedAudits = await AuditModel.find({
    ...auditFilter,
    _id: { $in: [input.auditAId, input.auditBId] },
  })
    .select({ type: 1, createdAt: 1, completedAt: 1, pagesCrawled: 1 })
    .lean()
    .exec();
  if (selectedAudits.length !== 2) {
    return {
      ...emptyResult,
      selectionError:
        "Both audits must be completed audits for the selected website.",
    };
  }
  const auditById = new Map(
    selectedAudits.map((audit) => [audit._id.toString(), audit]),
  );
  const auditA = auditById.get(input.auditAId);
  const auditB = auditById.get(input.auditBId);
  if (!auditA || !auditB) return emptyResult;
  const auditIds = [auditA._id, auditB._id];

  const [scoreDocuments, findingDocuments, pageDocuments] = await Promise.all([
    AuditScoreModel.find({
      auditId: { $in: auditIds },
      category: { $in: comparisonScoreCategories },
    })
      .select({ auditId: 1, category: 1, score: 1, evaluated: 1 })
      .lean()
      .exec(),
    AuditFindingModel.find({
      auditId: { $in: auditIds },
      severity: { $ne: FindingSeverity.PASSED },
    })
      .select({
        auditId: 1,
        ruleCode: 1,
        category: 1,
        severity: 1,
        title: 1,
        affectedUrl: 1,
        occurrences: 1,
      })
      .lean()
      .exec(),
    AuditPageModel.find({ auditId: { $in: auditIds } })
      .select({ auditId: 1, normalizedUrl: 1, url: 1 })
      .lean()
      .exec(),
  ]);
  const scoreSets = buildScoreSets(scoreDocuments);
  const findingsByAudit = new Map<string, ComparableFinding[]>();
  for (const finding of findingDocuments) {
    const auditId = finding.auditId.toString();
    const findings = findingsByAudit.get(auditId) ?? [];
    findings.push({
      ruleCode: finding.ruleCode,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      affectedUrl: finding.affectedUrl ?? null,
      occurrences: finding.occurrences ?? 1,
    });
    findingsByAudit.set(auditId, findings);
  }
  const pagesByAudit = new Map<
    string,
    Array<{ normalizedUrl: string; url: string }>
  >();
  for (const page of pageDocuments) {
    const auditId = page.auditId.toString();
    const pages = pagesByAudit.get(auditId) ?? [];
    pages.push({ normalizedUrl: page.normalizedUrl, url: page.url });
    pagesByAudit.set(auditId, pages);
  }
  const auditAId = auditA._id.toString();
  const auditBId = auditB._id.toString();
  const auditAFindings = findingsByAudit.get(auditAId) ?? [];
  const auditBFindings = findingsByAudit.get(auditBId) ?? [];

  return {
    ...emptyResult,
    comparison: {
      website: {
        id: website._id.toString(),
        name: website.name?.trim() || website.url,
        url: website.url,
      },
      auditA: {
        id: auditAId,
        type: auditA.type,
        createdAt: auditA.createdAt,
        completedAt: auditA.completedAt ?? auditA.createdAt,
        pagesCrawled: auditA.pagesCrawled ?? 0,
        scores: scoreSets.get(auditAId) ?? emptyScores(),
        criticalIssues: countSeverity(auditAFindings, FindingSeverity.CRITICAL),
        warnings: countSeverity(auditAFindings, FindingSeverity.WARNING),
      },
      auditB: {
        id: auditBId,
        type: auditB.type,
        createdAt: auditB.createdAt,
        completedAt: auditB.completedAt ?? auditB.createdAt,
        pagesCrawled: auditB.pagesCrawled ?? 0,
        scores: scoreSets.get(auditBId) ?? emptyScores(),
        criticalIssues: countSeverity(auditBFindings, FindingSeverity.CRITICAL),
        warnings: countSeverity(auditBFindings, FindingSeverity.WARNING),
      },
      findings: compareAuditFindings(auditAFindings, auditBFindings),
      pages: compareAuditPages(
        pagesByAudit.get(auditAId) ?? [],
        pagesByAudit.get(auditBId) ?? [],
      ),
    },
  };
}
