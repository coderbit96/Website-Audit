import {
  normalizeUrl,
  UrlSecurityError,
} from "@website-audit/audit-core/url-normalization";
import { z } from "zod";

export type NormalizedWebsiteUrl = {
  url: string;
  normalizedUrl: string;
};

export class WebsiteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteUrlError";
  }
}

const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const ipv4Pattern = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function normalizeWebsiteUrl(value: string): NormalizedWebsiteUrl {
  const input = value.trim();

  let parsed: URL;

  try {
    parsed = normalizeUrl(input);
  } catch (error) {
    throw new WebsiteUrlError(
      error instanceof UrlSecurityError
        ? error.message
        : "Enter a valid website domain.",
    );
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new WebsiteUrlError(
      "Enter the website homepage without a path, query, or fragment.",
    );
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^(?:www\.)+/, "");

  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    ipv4Pattern.test(hostname) ||
    hostname.includes(":") ||
    hostname.startsWith("[")
  ) {
    throw new WebsiteUrlError(
      "Enter a public website domain, not a local or IP address.",
    );
  }

  const labels = hostname.split(".");
  if (labels.some((label) => !domainLabelPattern.test(label))) {
    throw new WebsiteUrlError("Enter a valid website domain.");
  }

  const port = parsed.port ? `:${parsed.port}` : "";
  const normalizedUrl = `${hostname}${port}`;

  return {
    url: `${parsed.protocol}//${normalizedUrl}/`,
    normalizedUrl,
  };
}

export const websiteNameSchema = z
  .string()
  .trim()
  .min(2, "Website name must be at least 2 characters.")
  .max(100, "Website name must be 100 characters or fewer.");

export const websiteUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a website URL.")
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
            : "Enter a valid website domain.",
      });
    }
  });

export const createWebsiteSchema = z.object({
  name: websiteNameSchema,
  url: websiteUrlSchema,
});

export const updateWebsiteSchema = z.union([
  z.object({ name: websiteNameSchema }).strict(),
  z
    .object({
      action: z.enum(["archive", "restore"]),
    })
    .strict(),
]);

export const websiteListStatusSchema = z.enum(["active", "archived", "all"]);

export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
