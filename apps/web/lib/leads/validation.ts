import { z } from "zod";

export const publicLeadServices = [
  "full-report",
  "website-fix",
  "seo",
  "performance",
  "contact",
] as const;

export type PublicLeadService = (typeof publicLeadServices)[number];

export const publicLeadServiceLabels: Readonly<
  Record<PublicLeadService, string>
> = {
  "full-report": "Get Full Website Report",
  "website-fix": "Fix My Website",
  seo: "Improve My SEO",
  performance: "Optimize Website Performance",
  contact: "Contact Our Team",
};

const phoneSchema = z
  .string()
  .trim()
  .max(30, "Phone number is too long.")
  .refine(
    (value) => value === "" || /^[+()\-\s.\d]+$/.test(value),
    "Enter a valid phone number.",
  )
  .refine((value) => {
    if (value === "") return true;
    const digitCount = value.replace(/\D/g, "").length;
    return digitCount >= 7 && digitCount <= 15;
  }, "Enter a phone number with 7 to 15 digits.");

export const publicLeadRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your name.")
      .max(100, "Name is too long."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email address is too long.")
      .email("Enter a valid email address."),
    phone: phoneSchema,
    auditToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Audit is invalid."),
    requestedService: z.enum(publicLeadServices),
    source: z.literal("public-audit"),
    // Deliberately hidden from people. A populated value is a bot signal.
    company: z.string().max(0),
  })
  .strict();

export type PublicLeadRequestInput = z.infer<typeof publicLeadRequestSchema>;

export const leadListFilterSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    requestedService: z.enum(publicLeadServices).optional(),
    source: z.literal("public-audit").optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export type LeadListFilterInput = z.infer<typeof leadListFilterSchema>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseLeadListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): LeadListFilterInput {
  const raw = Object.fromEntries(
    (["search", "requestedService", "source", "page"] as const)
      .map((key) => [key, firstValue(searchParams[key])])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const parsed = leadListFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : { page: 1 };
}
