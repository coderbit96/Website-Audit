import { z } from "zod";

const publicHttpUrl = z
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

/** Uses Vercel's real production domain when no canonical URL was configured. */
export function parseDeploymentPublicEnvironment(
  input: Record<string, string | undefined>,
): PublicEnvironment {
  const configuredUrl = input.NEXT_PUBLIC_APP_URL;
  if (configuredUrl !== undefined) {
    return parsePublicEnvironment({ NEXT_PUBLIC_APP_URL: configuredUrl });
  }

  const domain = input.VERCEL_PROJECT_PRODUCTION_URL;
  if (!domain) {
    return parsePublicEnvironment({ NEXT_PUBLIC_APP_URL: undefined });
  }

  const result = parsePublicEnvironment({
    NEXT_PUBLIC_APP_URL: `https://${domain}`,
  });
  const url = new URL(result.NEXT_PUBLIC_APP_URL);
  if (
    url.hostname !== domain.toLowerCase() ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Public environment validation failed: invalid Vercel production domain");
  }

  return result;
}

export { environmentError };
