import { z } from "zod";

export const issueCategories = [
  "SEO",
  "TECHNICAL",
  "PERFORMANCE",
  "ACCESSIBILITY",
  "SECURITY",
  "MOBILE",
  "CONTENT",
] as const;
export const issueSeverities = [
  "CRITICAL",
  "WARNING",
  "RECOMMENDATION",
  "PASSED",
] as const;
export const issueStatuses = ["OPEN", "IGNORED", "FIXED", "REOPENED"] as const;
export const issueSorts = [
  "IMPACT_DESC",
  "NEWEST",
  "OLDEST",
  "TITLE_ASC",
  "PAGE_ASC",
] as const;

const optionalDatabaseId = z
  .string()
  .regex(/^[a-f\d]{24}$/i)
  .optional();

export const issueFilterSchema = z.object({
  website: optionalDatabaseId,
  audit: optionalDatabaseId,
  category: z.enum(issueCategories).optional(),
  severity: z.enum(issueSeverities).optional(),
  status: z.enum(issueStatuses).optional(),
  affectedPage: z.string().url().max(2_048).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(issueSorts).default("IMPACT_DESC"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  issue: optionalDatabaseId,
});

export type IssueFilterInput = z.infer<typeof issueFilterSchema>;

export const issueWorkflowActionSchema = z.object({
  action: z.enum(["ignore", "mark_fixed", "reopen"]),
});
export type IssueWorkflowAction = z.infer<
  typeof issueWorkflowActionSchema
>["action"];

export const workflowStatusByAction = {
  ignore: "IGNORED",
  mark_fixed: "FIXED",
  reopen: "REOPENED",
} as const satisfies Record<
  IssueWorkflowAction,
  (typeof issueStatuses)[number]
>;

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseIssueFilters(
  searchParams: RawSearchParams,
): IssueFilterInput {
  const candidate = {
    website: firstValue(searchParams.website) || undefined,
    audit: firstValue(searchParams.audit) || undefined,
    category: firstValue(searchParams.category) || undefined,
    severity: firstValue(searchParams.severity) || undefined,
    status: firstValue(searchParams.status) || undefined,
    affectedPage: firstValue(searchParams.affectedPage) || undefined,
    search: firstValue(searchParams.search)?.trim() || undefined,
    sort: firstValue(searchParams.sort) || undefined,
    page: firstValue(searchParams.page) || undefined,
    issue: firstValue(searchParams.issue) || undefined,
  };
  const parsed = issueFilterSchema.safeParse(candidate);
  return parsed.success ? parsed.data : { sort: "IMPACT_DESC", page: 1 };
}
