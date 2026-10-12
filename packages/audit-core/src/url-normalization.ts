export const MAX_URL_LENGTH = 2048;

export const UrlSecurityErrorCode = {
  EMPTY_URL: "EMPTY_URL",
  URL_TOO_LONG: "URL_TOO_LONG",
  MALFORMED_URL: "MALFORMED_URL",
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",
  CREDENTIALS_NOT_ALLOWED: "CREDENTIALS_NOT_ALLOWED",
  HOSTNAME_NOT_ALLOWED: "HOSTNAME_NOT_ALLOWED",
  ADDRESS_NOT_ALLOWED: "ADDRESS_NOT_ALLOWED",
  DNS_RESOLUTION_FAILED: "DNS_RESOLUTION_FAILED",
  NO_DNS_ADDRESSES: "NO_DNS_ADDRESSES",
} as const;

export type UrlSecurityErrorCode =
  (typeof UrlSecurityErrorCode)[keyof typeof UrlSecurityErrorCode];

export class UrlSecurityError extends Error {
  readonly code: UrlSecurityErrorCode;

  constructor(code: UrlSecurityErrorCode, message: string) {
    super(message);
    this.name = "UrlSecurityError";
    this.code = code;
  }
}

const absoluteProtocolPattern = /^[a-z][a-z\d+.-]*:/i;

export type NormalizeUrlOptions = {
  baseUrl?: string | URL;
  defaultProtocol?: "http:" | "https:";
};

/**
 * Produces a canonical HTTP(S) URL without performing DNS I/O. Call
 * validatePublicHttpUrl before any network request.
 */
export function normalizeUrl(
  value: string | URL,
  options: NormalizeUrlOptions = {},
): URL {
  const input = value instanceof URL ? value.href : value.trim();

  if (!input) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.EMPTY_URL,
      "Enter a website URL.",
    );
  }

  if (input.length > MAX_URL_LENGTH) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.URL_TOO_LONG,
      "The website URL is too long.",
    );
  }

  const defaultProtocol = options.defaultProtocol ?? "https:";
  let candidate = input;

  if (!absoluteProtocolPattern.test(candidate) && !options.baseUrl) {
    candidate = `${defaultProtocol}//${candidate}`;
  }

  let url: URL;
  try {
    url = options.baseUrl
      ? new URL(candidate, options.baseUrl)
      : new URL(candidate);
  } catch {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.MALFORMED_URL,
      "Enter a valid website URL.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.UNSUPPORTED_PROTOCOL,
      "Only HTTP and HTTPS URLs are supported.",
    );
  }

  if (url.username || url.password) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.CREDENTIALS_NOT_ALLOWED,
      "Website URLs cannot contain credentials.",
    );
  }

  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.hash = "";

  return url;
}
