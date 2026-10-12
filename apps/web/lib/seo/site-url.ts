import { getPublicEnvironment } from "../environment/public";

/** Returns the validated browser-safe public origin. */
export function getSiteUrl(): URL {
  return new URL(new URL(getPublicEnvironment().NEXT_PUBLIC_APP_URL).origin);
}

export function getAbsoluteSiteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
