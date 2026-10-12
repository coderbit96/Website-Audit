import {
  AUDIT_PRESET_DEFINITIONS,
  AuditPreset,
} from "@website-audit/audit-core/audit-queue";
import { z } from "zod";

const mongoIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Choose a valid website.");

export const auditSettingsSchema = z
  .object({
    maximumPages: z.number().int().min(1),
    maximumDepth: z.number().int().min(0),
    respectRobotsTxt: z.boolean(),
    checkExternalLinks: z.boolean(),
    javascriptRendering: z.boolean(),
    performanceAnalysis: z.boolean(),
    accessibilityAnalysis: z.boolean(),
    securityAnalysis: z.boolean(),
    mobileAnalysis: z.boolean(),
  })
  .strict();

export const createAuditSchema = z
  .object({
    websiteId: mongoIdSchema,
    preset: z.enum(AuditPreset),
    settings: auditSettingsSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const definition = AUDIT_PRESET_DEFINITIONS[input.preset];

    if (input.settings.javascriptRendering) {
      context.addIssue({
        code: "custom",
        path: ["settings", "javascriptRendering"],
        message: "JavaScript page rendering is not available yet.",
      });
    }

    if (input.settings.maximumPages > definition.maximumPagesLimit) {
      context.addIssue({
        code: "custom",
        path: ["settings", "maximumPages"],
        message: `${definition.label} supports at most ${definition.maximumPagesLimit} pages.`,
      });
    }

    if (input.settings.maximumDepth > definition.maximumDepthLimit) {
      context.addIssue({
        code: "custom",
        path: ["settings", "maximumDepth"],
        message: `${definition.label} supports a maximum depth of ${definition.maximumDepthLimit}.`,
      });
    }
  });

export type CreateAuditInput = z.infer<typeof createAuditSchema>;
