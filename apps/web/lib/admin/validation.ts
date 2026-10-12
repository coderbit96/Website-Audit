import { z } from "zod";

export const adminCreditMetrics = [
  "AUDITS",
  "PAGES_CRAWLED",
  "WEBSITES",
  "REPORT_GENERATIONS",
  "SCHEDULED_AUDITS",
  "CLIENTS",
] as const;

export const grantOfflineCreditSchema = z
  .object({
    requestId: z.uuid(),
    workspaceId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid workspace."),
    recipientUserId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user."),
    metric: z.enum(adminCreditMetrics),
    quantity: z
      .number()
      .int("Credit quantity must be a whole number.")
      .min(1, "Credit quantity must be at least 1.")
      .max(1_000_000, "Credit quantity is too large."),
    note: z
      .string()
      .trim()
      .max(240, "Note must be 240 characters or fewer.")
      .optional()
      .transform((value) => value || undefined),
  })
  .strict();

export type GrantOfflineCreditInput = z.infer<typeof grantOfflineCreditSchema>;

export function parseAdminPage(value: string | string[] | undefined): number {
  const parsed = z.coerce.number().int().min(1).max(1_000).safeParse(value);
  return parsed.success ? parsed.data : 1;
}
