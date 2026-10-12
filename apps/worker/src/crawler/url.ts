const ignoredExtensions = new Set([
  ".7z",
  ".apk",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".css",
  ".csv",
  ".dmg",
  ".doc",
  ".docx",
  ".eot",
  ".epub",
  ".exe",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".msi",
  ".odt",
  ".ogg",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".psd",
  ".rar",
  ".rtf",
  ".sql",
  ".sqlite",
  ".svg",
  ".tar",
  ".tgz",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xml",
  ".zip",
]);

const unsafeActionSegments = new Set([
  "delete",
  "destroy",
  "logoff",
  "logout",
  "remove",
  "signout",
  "unsubscribe",
]);
const sensitiveQueryKeys = new Set([
  "access_token",
  "auth_token",
  "password",
  "phpsessid",
  "session",
  "sessionid",
  "sid",
  "token",
]);

export class CrawlUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlUrlError";
  }
}

/** Preserves query semantics while sorting key/value pairs deterministically. */
export function normalizeCrawlUrl(
  value: string | URL,
  baseUrl?: string | URL,
): string {
  if (String(value).length > 2_048) {
    throw new CrawlUrlError("The crawl URL exceeds the safe length limit.");
  }
  let url: URL;
  try {
    url = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    throw new CrawlUrlError("The crawl URL is malformed.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CrawlUrlError("Only HTTP and HTTPS crawl URLs are supported.");
  }
  if (url.username || url.password) {
    throw new CrawlUrlError("Credentials are not allowed in crawl URLs.");
  }
  url.hash = "";

  const entries = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    },
  );
  url.search = "";
  for (const [key, entryValue] of entries)
    url.searchParams.append(key, entryValue);
  if (url.href.length > 2_048) {
    throw new CrawlUrlError("The crawl URL exceeds the safe length limit.");
  }
  return url.href;
}

export function isSameOrigin(left: string | URL, right: string | URL): boolean {
  return new URL(left).origin === new URL(right).origin;
}

export function isCrawlableHtmlUrl(value: string | URL): boolean {
  const url = new URL(value);
  if (url.href.length > 2_048) return false;
  const lastSegment = url.pathname.toLowerCase().split("/").at(-1) ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex === -1 || !ignoredExtensions.has(lastSegment.slice(dotIndex));
}

/** Avoids requests to action links or session-bearing URLs. */
export function isSafePassiveRequestUrl(value: string | URL): boolean {
  const url = new URL(value);
  if (url.href.length > 2_048) return false;
  if (
    url.pathname
      .toLowerCase()
      .split("/")
      .some((segment) =>
        unsafeActionSegments.has(segment.split(".", 1)[0] ?? ""),
      )
  ) {
    return false;
  }
  for (const [key, entryValue] of url.searchParams) {
    const normalizedKey = key.toLowerCase();
    if (sensitiveQueryKeys.has(normalizedKey)) return false;
    if (
      (normalizedKey === "action" || normalizedKey === "do") &&
      unsafeActionSegments.has(entryValue.toLowerCase())
    ) {
      return false;
    }
  }
  return true;
}

export function isSafeCrawlDiscoveryUrl(value: string | URL): boolean {
  return isCrawlableHtmlUrl(value) && isSafePassiveRequestUrl(value);
}
