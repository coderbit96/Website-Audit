import { z } from "zod";

import { environmentError, publicEnvironmentSchema } from "./public.js";

const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(16, "must contain at least 16 characters").optional(),
);

const optionalText = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().optional(),
);

const optionalHttpUrl = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .url("must be a valid absolute URL")
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "must use http or https")
    .optional(),
);

const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const mongoConnectionString = z
  .string()
  .trim()
  .min(1, "is required")
  .refine(
    (value) =>
      value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
    "must use mongodb:// or mongodb+srv://",
  );

const nodeEnvironment = z
  .enum(["development", "test", "production"])
  .default("development");

export const databaseEnvironmentSchema = z
  .object({
    MONGODB_URI: mongoConnectionString,
    NODE_ENV: nodeEnvironment,
  })
  .strip();

export const workerEnvironmentSchema = databaseEnvironmentSchema
  .extend({
    GOOGLE_PAGESPEED_API_KEY: optionalText,
  })
  .strip();

export const webServerEnvironmentSchema = databaseEnvironmentSchema
  .extend({
    ...publicEnvironmentSchema.shape,
    AUTH_SECRET: z
      .string()
      .trim()
      .min(16, "must contain at least 16 characters"),
    AUTH_URL: optionalHttpUrl,
    NEXTAUTH_URL: optionalHttpUrl,
    GOOGLE_PAGESPEED_API_KEY: optionalText,
    PUBLIC_AUDIT_HASH_SECRET: optionalSecret,
    PUBLIC_AUDIT_TRUST_PROXY: booleanFlag,
    RATE_LIMIT_HASH_SECRET: optionalSecret,
    RATE_LIMIT_TRUST_PROXY: booleanFlag,
    SUPER_ADMIN_EMAIL: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().toLowerCase().email().optional(),
    ),
    RAZORPAY_KEY_ID: z.preprocess(
      emptyStringToUndefined,
      z
        .string()
        .trim()
        .regex(/^rzp_(?:test|live)_[A-Za-z0-9]+$/)
        .optional(),
    ),
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,
  })
  .superRefine((environment, context) => {
    const checkoutKeys = [
      environment.RAZORPAY_KEY_ID,
      environment.RAZORPAY_KEY_SECRET,
    ];
    if (checkoutKeys.some(Boolean) && !checkoutKeys.every(Boolean)) {
      context.addIssue({
        code: "custom",
        message:
          "Razorpay key ID and key secret are both required to enable checkout",
        path: ["RAZORPAY_KEY_ID"],
      });
    }
    if (environment.RAZORPAY_WEBHOOK_SECRET && !checkoutKeys.every(Boolean)) {
      context.addIssue({
        code: "custom",
        message:
          "Razorpay checkout keys are required before a webhook can be enabled",
        path: ["RAZORPAY_WEBHOOK_SECRET"],
      });
    }
    if (!environment.AUTH_URL && !environment.NEXTAUTH_URL) {
      context.addIssue({
        code: "custom",
        message: "AUTH_URL or NEXTAUTH_URL is required",
        path: ["AUTH_URL"],
      });
    }
    if (
      environment.AUTH_SECRET === "replace-with-a-long-random-secret" ||
      (environment.NODE_ENV === "production" &&
        environment.AUTH_SECRET.length < 32)
    ) {
      context.addIssue({
        code: "custom",
        message:
          environment.NODE_ENV === "production"
            ? "must contain at least 32 non-placeholder characters in production"
            : "must not use the example placeholder",
        path: ["AUTH_SECRET"],
      });
    }
  });

export const developmentSeedEnvironmentSchema = databaseEnvironmentSchema
  .extend({
    DEVELOPMENT_SEED_ENABLED: z.literal("true", {
      error: "must be true to run the development seed",
    }),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        message: "development seed data is forbidden in production",
        path: ["NODE_ENV"],
      });
    }
  });

export const superAdminBootstrapEnvironmentSchema = databaseEnvironmentSchema
  .extend({
    SUPER_ADMIN_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .email("must be a valid email address"),
    SUPER_ADMIN_INITIAL_PASSWORD: z
      .string()
      .min(12, "must contain at least 12 characters")
      .refine((value) => /[a-z]/.test(value), "must contain a lowercase letter")
      .refine(
        (value) => /[A-Z]/.test(value),
        "must contain an uppercase letter",
      )
      .refine((value) => /[0-9]/.test(value), "must contain a number"),
  })
  .strip();

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type WebServerEnvironment = z.infer<typeof webServerEnvironmentSchema>;
export type DevelopmentSeedEnvironment = z.infer<
  typeof developmentSeedEnvironmentSchema
>;

function parseEnvironment<T>(
  scope: string,
  schema: z.ZodType<T>,
  input: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw environmentError(scope, result.error);
  return result.data;
}

export function parseDatabaseEnvironment(
  input: Record<string, string | undefined>,
): DatabaseEnvironment {
  return parseEnvironment("Database", databaseEnvironmentSchema, input);
}

export function parseWorkerEnvironment(
  input: Record<string, string | undefined>,
): WorkerEnvironment {
  return parseEnvironment("Worker", workerEnvironmentSchema, input);
}

export function parseWebServerEnvironment(
  input: Record<string, string | undefined>,
): WebServerEnvironment {
  return parseEnvironment("Web server", webServerEnvironmentSchema, input);
}

export function parseDevelopmentSeedEnvironment(
  input: Record<string, string | undefined>,
): DevelopmentSeedEnvironment {
  return parseEnvironment(
    "Development seed",
    developmentSeedEnvironmentSchema,
    input,
  );
}

export function parseSuperAdminBootstrapEnvironment(
  input: Record<string, string | undefined>,
) {
  return parseEnvironment(
    "Super Admin bootstrap",
    superAdminBootstrapEnvironmentSchema,
    input,
  );
}
