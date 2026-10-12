import { AuditCategory } from "@website-audit/database";

export const auditReportTabs = [
  "overview",
  "seo",
  "technical",
  "performance",
  "accessibility",
  "security",
  "mobile",
  "pages",
  "issues",
] as const;
export type AuditReportTab = (typeof auditReportTabs)[number];

export const auditCategoryByReportTab: Partial<
  Record<AuditReportTab, AuditCategory>
> = Object.freeze({
  seo: AuditCategory.SEO,
  technical: AuditCategory.TECHNICAL,
  performance: AuditCategory.PERFORMANCE,
  accessibility: AuditCategory.ACCESSIBILITY,
  security: AuditCategory.SECURITY,
  mobile: AuditCategory.MOBILE,
});

export function parseAuditReportTab(
  value: string | string[] | undefined,
): AuditReportTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return auditReportTabs.includes(candidate as AuditReportTab)
    ? (candidate as AuditReportTab)
    : "overview";
}
