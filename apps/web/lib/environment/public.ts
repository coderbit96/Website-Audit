import {
  parseDeploymentPublicEnvironment,
  type PublicEnvironment,
} from "@website-audit/shared/environment/public";

let cachedEnvironment: PublicEnvironment | null = null;

/** Returns only variables whose NEXT_PUBLIC_ prefix permits browser exposure. */
export function getPublicEnvironment(): PublicEnvironment {
  cachedEnvironment ??= parseDeploymentPublicEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  return cachedEnvironment;
}
