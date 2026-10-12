import { z } from "zod";

const databaseId = z.string().regex(/^[a-f\d]{24}$/i);

export type AuditComparisonSelection = {
  website?: string;
  auditA?: string;
  auditB?: string;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDatabaseId(
  value: string | string[] | undefined,
): string | undefined {
  const parsed = databaseId.safeParse(firstValue(value));
  return parsed.success ? parsed.data : undefined;
}

export function parseAuditComparisonSelection(
  searchParams: Record<string, string | string[] | undefined>,
): AuditComparisonSelection {
  const website = validDatabaseId(searchParams.website);
  const auditA = validDatabaseId(searchParams.auditA);
  const auditB = validDatabaseId(searchParams.auditB);
  return {
    ...(website ? { website } : {}),
    ...(auditA ? { auditA } : {}),
    ...(auditB ? { auditB } : {}),
  };
}
