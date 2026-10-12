import { z } from "zod";

const publicHttpUrl = z
  .string()
  .trim()
  .url("must be a valid absolute URL")
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "must use http or https");

export const publicEnvironmentSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: publicHttpUrl,
  })
  .strip();

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

function environmentError(scope: string, error: z.ZodError): Error {
  const details = error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("; ");
  return new Error(`${scope} environment validation failed: ${details}`);
}

/** Validates only values that are explicitly safe to expose to browser code. */
export function parsePublicEnvironment(
  input: Record<string, string | undefined>,
): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(input);
  if (!result.success) throw environmentError("Public", result.error);
  return result.data;
}

export { environmentError };
