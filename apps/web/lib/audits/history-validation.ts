import { z } from "zod";

export const auditHistoryStatuses = [
  "QUEUED",
  "INITIALIZING",
  "CRAWLING",
  "ANALYZING",
  "SCORING",
  "GENERATING_REPORT",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const auditHistoryTypes = [
  "QUICK",
  "STANDARD",
  "FULL",
  "FULL_SITE",
  "SINGLE_PAGE",
] as const;

const databaseId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));

export const auditHistoryFilterSchema = z
  .object({
    website: databaseId.optional(),
    status: z.enum(auditHistoryStatuses).optional(),
    type: z.enum(auditHistoryTypes).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "The start date must not be after the end date.",
  );

export type AuditHistoryFilterInput = z.infer<typeof auditHistoryFilterSchema>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuditHistoryFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AuditHistoryFilterInput {
  const rawFilters = Object.fromEntries(
    (["website", "status", "type", "from", "to", "page"] as const)
      .map((key) => [key, firstValue(searchParams[key])])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const parsed = auditHistoryFilterSchema.safeParse(rawFilters);
  return parsed.success ? parsed.data : { page: 1 };
}
