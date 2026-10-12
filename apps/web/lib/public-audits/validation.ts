import { z } from "zod";

import { normalizeWebsiteUrl, WebsiteUrlError } from "../websites/validation";

export const publicAuditRequestSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "Enter your website URL.")
      .max(2048, "The website URL is too long.")
      .superRefine((value, context) => {
        try {
          normalizeWebsiteUrl(value);
        } catch (error) {
          context.addIssue({
            code: "custom",
            message:
              error instanceof WebsiteUrlError
                ? error.message
                : "Enter a valid public website domain.",
          });
        }
      }),
    // Deliberately hidden from people. A populated value is a bot signal.
    company: z.string().max(0),
  })
  .strict();

export type PublicAuditRequestInput = z.infer<typeof publicAuditRequestSchema>;
