import { z } from "zod";

export const pageExplorerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  search: z.string().trim().max(200).optional(),
});

export type PageExplorerQuery = z.infer<typeof pageExplorerQuerySchema>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePageExplorerQuery(
  searchParams: Record<string, string | string[] | undefined>,
): PageExplorerQuery {
  const parsed = pageExplorerQuerySchema.safeParse({
    page: firstValue(searchParams.page) || undefined,
    search: firstValue(searchParams.search)?.trim() || undefined,
  });
  return parsed.success ? parsed.data : { page: 1 };
}
