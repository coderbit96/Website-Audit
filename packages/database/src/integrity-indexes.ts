/** One finding per rule, page (or site), and observed element in an audit. */
export const AUDIT_FINDING_IDENTITY_KEYS = {
  auditId: 1,
  category: 1,
  ruleCode: 1,
  affectedUrl: 1,
  affectedElement: 1,
} as const;
export const AUDIT_FINDING_IDENTITY_INDEX = "audit_finding_identity_unique";

/** Metric keys represent one measured value per category and audit. */
export const AUDIT_METRIC_IDENTITY_KEYS = {
  auditId: 1,
  category: 1,
  key: 1,
} as const;
export const AUDIT_METRIC_IDENTITY_INDEX = "audit_metric_identity_unique";
