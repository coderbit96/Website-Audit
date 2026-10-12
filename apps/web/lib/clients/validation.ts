import { z } from "zod";

const optionalTrimmedString = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => value || undefined)
    .optional();

const optionalEmail = z
  .string()
  .trim()
  .max(254, "Email must be 254 characters or fewer.")
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  })
  .transform((value) => value.toLocaleLowerCase("en-US") || undefined)
  .optional();

const optionalPhone = z
  .string()
  .trim()
  .max(30, "Phone number must be 30 characters or fewer.")
  .refine((value) => value === "" || value.length >= 7, {
    message: "Phone number must be at least 7 characters.",
  })
  .refine((value) => value === "" || /^\+?[\d][\d\s().-]*$/.test(value), {
    message: "Phone number contains unsupported characters.",
  })
  .transform((value) => value || undefined)
  .optional();

export const clientFieldsSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(2, "Company name must be at least 2 characters.")
      .max(120, "Company name must be 120 characters or fewer."),
    contactName: optionalTrimmedString(100),
    email: optionalEmail,
    phone: optionalPhone,
    notes: optionalTrimmedString(2_000),
  })
  .strict();

export const createClientSchema = clientFieldsSchema;

export const updateClientSchema = z.discriminatedUnion("operation", [
  clientFieldsSchema.extend({ operation: z.literal("update") }).strict(),
  z.object({ operation: z.literal("archive") }).strict(),
  z.object({ operation: z.literal("restore") }).strict(),
  z
    .object({
      operation: z.literal("websites"),
      websiteIds: z
        .array(z.string().regex(/^[a-f\d]{24}$/i, "Website ID is invalid."))
        .max(50, "A client can have at most 50 websites.")
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Website selections must be unique.",
        }),
    })
    .strict(),
]);

export const clientListStatusSchema = z.enum(["active", "archived", "all"]);

export type ClientFieldsInput = z.infer<typeof clientFieldsSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
