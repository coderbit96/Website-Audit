import {
  sortAuditRuleResults,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";
import { load } from "cheerio";

import {
  SECURITY_RULE_THRESHOLDS,
  createSecurityRuleResults,
} from "./security-rules.js";

export const SecurityDetermination = {
  CONFIRMED_MISSING: "CONFIRMED_MISSING",
  OBSERVED_CONFIGURATION: "OBSERVED_CONFIGURATION",
  OBSERVED_INSECURE_CONFIGURATION: "OBSERVED_INSECURE_CONFIGURATION",
  CANNOT_DETERMINE: "CANNOT_DETERMINE",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type SecurityDetermination =
  (typeof SecurityDetermination)[keyof typeof SecurityDetermination];

export type SecurityTransportObservation = {
  tlsAvailability: "AVAILABLE" | "CANNOT_DETERMINE";
  tlsUrl: string;
  tlsEvidence: string;
  httpToHttpsBehavior:
    "REDIRECTS_TO_HTTPS" | "DOES_NOT_REDIRECT" | "CANNOT_DETERMINE";
  httpProbeUrl: string;
  httpFinalUrl: string | null;
  httpStatusCode: number | null;
  httpEvidence: string;
};

export type SecurityPageInput = {
  url: string;
  statusCode: number | null;
  contentType: string | null;
  headers: Readonly<Record<string, string>> | null;
  setCookieHeaders: readonly string[];
  html?: string | null;
  htmlObservations?: SecurityHtmlObservations | null;
  mixedContentResources: readonly { url: string; type: string }[];
  mixedContentResourceCount: number;
};

export type SecurityHtmlObservations = {
  metaCsp: string | null;
  generator: string | null;
};

export type SecurityCheck = {
  check:
    | "TLS_AVAILABILITY"
    | "HTTP_TO_HTTPS"
    | "HTTPS"
    | "HSTS"
    | "CONTENT_SECURITY_POLICY"
    | "X_CONTENT_TYPE_OPTIONS"
    | "FRAME_PROTECTION"
    | "REFERRER_POLICY"
    | "PERMISSIONS_POLICY"
    | "MIXED_CONTENT"
    | "SERVER_DISCLOSURE"
    | "TECHNOLOGY_DISCLOSURE"
    | "COOKIE_ATTRIBUTES";
  url: string | null;
  determination: SecurityDetermination;
  evidence: Readonly<Record<string, unknown>>;
};

export type SecuritySiteReport = {
  findings: AuditRuleResult[];
  checks: SecurityCheck[];
  evaluatedPageCount: number;
  metrics: ReadonlyArray<{
    category: "SECURITY";
    key: string;
    value: number;
    unit: string;
  }>;
};

type FindingEvidence = Readonly<Record<string, unknown>> & {
  url: string;
  determination: SecurityDetermination;
};

type ParsedCookie = {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "STRICT" | "LAX" | "NONE" | "OTHER" | null;
};

const technologyHeaders = Object.freeze([
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-runtime",
]);

function bounded(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizedHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      value.trim(),
    ]),
  );
}

function isAnalyzableHtmlPage(page: SecurityPageInput): boolean {
  return (
    page.statusCode !== null &&
    page.statusCode >= 200 &&
    page.statusCode < 300 &&
    (page.contentType?.toLowerCase().includes("html") ?? false) &&
    page.headers !== null &&
    (page.html != null || page.htmlObservations != null)
  );
}

function hasFrameAncestors(csp: string): boolean {
  return csp
    .split(";")
    .some((directive) => /^\s*frame-ancestors(?:\s|$)/i.test(directive));
}

function hstsMaxAge(value: string): number | null {
  const match = /(?:^|;)\s*max-age\s*=\s*(\d+)\s*(?:;|$)/i.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseCookie(header: string): ParsedCookie | null {
  const parts = header.split(";");
  const pair = parts.shift()?.trim() ?? "";
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;
  const name = bounded(
    pair.slice(0, separator),
    SECURITY_RULE_THRESHOLDS.maximumTechnologyValueLength,
  );
  if (!name) return null;

  let sameSite: ParsedCookie["sameSite"] = null;
  const attributeNames = new Set<string>();
  for (const rawAttribute of parts) {
    const [rawName = "", ...rawValueParts] = rawAttribute.split("=");
    const attributeName = rawName.trim().toLowerCase();
    const attributeValue = rawValueParts.join("=").trim().toLowerCase();
    if (!attributeName) continue;
    attributeNames.add(attributeName);
    if (attributeName === "samesite") {
      sameSite =
        attributeValue === "strict"
          ? "STRICT"
          : attributeValue === "lax"
            ? "LAX"
            : attributeValue === "none"
              ? "NONE"
              : "OTHER";
    }
  }

  return {
    name,
    secure: attributeNames.has("secure"),
    httpOnly: attributeNames.has("httponly"),
    sameSite,
  };
}

export function extractSecurityHtmlObservations(
  html: string,
): SecurityHtmlObservations {
  const $ = load(html);
  let metaCsp: string | null = null;
  let generator: string | null = null;
  $("meta").each((_index, element) => {
    const httpEquiv = ($(element).attr("http-equiv") ?? "").toLowerCase();
    const name = ($(element).attr("name") ?? "").toLowerCase();
    const content = ($(element).attr("content") ?? "").trim();
    if (!metaCsp && httpEquiv === "content-security-policy" && content) {
      metaCsp = bounded(
        content,
        SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
      );
    }
    if (!generator && name === "generator" && content) {
      generator = bounded(
        content,
        SECURITY_RULE_THRESHOLDS.maximumTechnologyValueLength,
      );
    }
  });
  return { metaCsp, generator };
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function aggregateMatch(
  ruleCode: string,
  entries: readonly FindingEvidence[],
): AuditRuleMatch | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (left, right) =>
      left.url.localeCompare(right.url) ||
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  const affectedUrls = distinctSorted(sorted.map((entry) => entry.url));
  const determinations = distinctSorted(
    sorted.map((entry) => entry.determination),
  );
  return {
    ruleCode,
    affectedUrl: affectedUrls.length === 1 ? (affectedUrls[0] ?? null) : null,
    occurrences: entries.length,
    evidence: {
      determination:
        determinations.length === 1 ? determinations[0] : "MULTIPLE",
      determinations,
      totalOccurrences: entries.length,
      affectedUrlCount: affectedUrls.length,
      affectedUrls: affectedUrls.slice(
        0,
        SECURITY_RULE_THRESHOLDS.maximumEvidenceUrls,
      ),
      details: sorted.slice(0, SECURITY_RULE_THRESHOLDS.maximumEvidenceUrls),
      evidenceTruncated:
        sorted.length > SECURITY_RULE_THRESHOLDS.maximumEvidenceUrls,
    },
  };
}

function addCheck(
  checks: SecurityCheck[],
  check: SecurityCheck["check"],
  url: string | null,
  determination: SecurityDetermination,
  evidence: Readonly<Record<string, unknown>>,
): void {
  checks.push({ check, url, determination, evidence });
}

export function analyzeSecuritySite(input: {
  pages: readonly SecurityPageInput[];
  transport: SecurityTransportObservation;
}): SecuritySiteReport {
  const checks: SecurityCheck[] = [];
  const evidenceByRule = new Map<string, FindingEvidence[]>();
  const addFindingEvidence = (ruleCode: string, evidence: FindingEvidence) => {
    const entries = evidenceByRule.get(ruleCode) ?? [];
    entries.push(evidence);
    evidenceByRule.set(ruleCode, entries);
  };

  addCheck(
    checks,
    "TLS_AVAILABILITY",
    input.transport.tlsUrl,
    input.transport.tlsAvailability === "AVAILABLE"
      ? SecurityDetermination.OBSERVED_CONFIGURATION
      : SecurityDetermination.CANNOT_DETERMINE,
    {
      availability: input.transport.tlsAvailability,
      evidence: input.transport.tlsEvidence,
    },
  );
  const redirectDetermination =
    input.transport.httpToHttpsBehavior === "REDIRECTS_TO_HTTPS"
      ? SecurityDetermination.OBSERVED_CONFIGURATION
      : input.transport.httpToHttpsBehavior === "DOES_NOT_REDIRECT"
        ? SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION
        : SecurityDetermination.CANNOT_DETERMINE;
  addCheck(
    checks,
    "HTTP_TO_HTTPS",
    input.transport.httpProbeUrl,
    redirectDetermination,
    {
      behavior: input.transport.httpToHttpsBehavior,
      finalUrl: input.transport.httpFinalUrl,
      statusCode: input.transport.httpStatusCode,
      evidence: input.transport.httpEvidence,
    },
  );
  if (input.transport.httpToHttpsBehavior === "DOES_NOT_REDIRECT") {
    addFindingEvidence("SEC_HTTP_TO_HTTPS_MISSING", {
      url: input.transport.httpProbeUrl,
      determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
      finalUrl: input.transport.httpFinalUrl,
      statusCode: input.transport.httpStatusCode,
      observation: input.transport.httpEvidence,
    });
  }

  const pages = [...input.pages].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  const evaluatedPages = pages.filter(isAnalyzableHtmlPage);
  let observedCookieCount = 0;
  let mixedContentResourceCount = 0;

  for (const page of evaluatedPages) {
    const headers = normalizedHeaders(page.headers ?? {});
    const html =
      page.htmlObservations ?? extractSecurityHtmlObservations(page.html ?? "");
    const protocol = new URL(page.url).protocol;
    const securePage = protocol === "https:";

    addCheck(
      checks,
      "HTTPS",
      page.url,
      securePage
        ? SecurityDetermination.OBSERVED_CONFIGURATION
        : SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
      { protocol },
    );
    if (!securePage) {
      addFindingEvidence("SEC_HTTPS_NOT_USED", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        protocol,
      });
    }

    const hsts = headers["strict-transport-security"];
    if (!securePage) {
      addCheck(checks, "HSTS", page.url, SecurityDetermination.NOT_APPLICABLE, {
        reason: "HSTS is only effective on HTTPS responses.",
      });
    } else if (!hsts) {
      addCheck(
        checks,
        "HSTS",
        page.url,
        SecurityDetermination.CONFIRMED_MISSING,
        { header: "strict-transport-security" },
      );
      addFindingEvidence("SEC_HSTS_MISSING", {
        url: page.url,
        determination: SecurityDetermination.CONFIRMED_MISSING,
        header: "strict-transport-security",
      });
    } else {
      const maxAge = hstsMaxAge(hsts);
      const valid = maxAge !== null && maxAge > 0;
      addCheck(
        checks,
        "HSTS",
        page.url,
        valid
          ? SecurityDetermination.OBSERVED_CONFIGURATION
          : SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        {
          header: "strict-transport-security",
          value: bounded(
            hsts,
            SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
          ),
          maxAge,
        },
      );
      if (!valid) {
        addFindingEvidence("SEC_HSTS_INVALID", {
          url: page.url,
          determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
          header: "strict-transport-security",
          value: bounded(
            hsts,
            SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
          ),
          maxAge,
        });
      }
    }

    const cspHeader = headers["content-security-policy"];
    const csp = cspHeader || html.metaCsp;
    if (csp) {
      addCheck(
        checks,
        "CONTENT_SECURITY_POLICY",
        page.url,
        SecurityDetermination.OBSERVED_CONFIGURATION,
        {
          source: cspHeader ? "HEADER" : "META",
          value: bounded(
            csp,
            SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
          ),
        },
      );
    } else {
      const reportOnly = headers["content-security-policy-report-only"];
      addCheck(
        checks,
        "CONTENT_SECURITY_POLICY",
        page.url,
        SecurityDetermination.CONFIRMED_MISSING,
        {
          header: "content-security-policy",
          reportOnlyObserved: Boolean(reportOnly),
        },
      );
      addFindingEvidence("SEC_CSP_MISSING", {
        url: page.url,
        determination: SecurityDetermination.CONFIRMED_MISSING,
        header: "content-security-policy",
        reportOnlyObserved: Boolean(reportOnly),
      });
    }

    const contentTypeOptions = headers["x-content-type-options"];
    if (!contentTypeOptions) {
      addCheck(
        checks,
        "X_CONTENT_TYPE_OPTIONS",
        page.url,
        SecurityDetermination.CONFIRMED_MISSING,
        { header: "x-content-type-options" },
      );
      addFindingEvidence("SEC_X_CONTENT_TYPE_OPTIONS_MISSING", {
        url: page.url,
        determination: SecurityDetermination.CONFIRMED_MISSING,
        header: "x-content-type-options",
      });
    } else if (contentTypeOptions.toLowerCase() !== "nosniff") {
      addCheck(
        checks,
        "X_CONTENT_TYPE_OPTIONS",
        page.url,
        SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        { header: "x-content-type-options", value: contentTypeOptions },
      );
      addFindingEvidence("SEC_X_CONTENT_TYPE_OPTIONS_INVALID", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        header: "x-content-type-options",
        value: bounded(
          contentTypeOptions,
          SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
        ),
      });
    } else {
      addCheck(
        checks,
        "X_CONTENT_TYPE_OPTIONS",
        page.url,
        SecurityDetermination.OBSERVED_CONFIGURATION,
        { header: "x-content-type-options", value: "nosniff" },
      );
    }

    const frameOptions = headers["x-frame-options"];
    const validFrameOptions =
      frameOptions !== undefined &&
      ["DENY", "SAMEORIGIN"].includes(frameOptions.toUpperCase());
    const cspFrameAncestors = Boolean(
      cspHeader && hasFrameAncestors(cspHeader),
    );
    if (validFrameOptions || cspFrameAncestors) {
      addCheck(
        checks,
        "FRAME_PROTECTION",
        page.url,
        SecurityDetermination.OBSERVED_CONFIGURATION,
        {
          xFrameOptions: frameOptions ?? null,
          cspFrameAncestors,
        },
      );
    } else if (frameOptions) {
      addCheck(
        checks,
        "FRAME_PROTECTION",
        page.url,
        SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        { xFrameOptions: frameOptions, cspFrameAncestors: false },
      );
      addFindingEvidence("SEC_X_FRAME_OPTIONS_INVALID", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        header: "x-frame-options",
        value: bounded(
          frameOptions,
          SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength,
        ),
      });
    } else {
      addCheck(
        checks,
        "FRAME_PROTECTION",
        page.url,
        SecurityDetermination.CONFIRMED_MISSING,
        { xFrameOptions: null, cspFrameAncestors: false },
      );
      addFindingEvidence("SEC_FRAME_PROTECTION_MISSING", {
        url: page.url,
        determination: SecurityDetermination.CONFIRMED_MISSING,
        headers: ["x-frame-options", "content-security-policy"],
      });
    }

    for (const [header, check, ruleCode] of [
      ["referrer-policy", "REFERRER_POLICY", "SEC_REFERRER_POLICY_MISSING"],
      [
        "permissions-policy",
        "PERMISSIONS_POLICY",
        "SEC_PERMISSIONS_POLICY_MISSING",
      ],
    ] as const) {
      const value = headers[header];
      const determination = value
        ? SecurityDetermination.OBSERVED_CONFIGURATION
        : SecurityDetermination.CONFIRMED_MISSING;
      addCheck(checks, check, page.url, determination, {
        header,
        value: value
          ? bounded(value, SECURITY_RULE_THRESHOLDS.maximumHeaderValueLength)
          : null,
      });
      if (!value) {
        addFindingEvidence(ruleCode, {
          url: page.url,
          determination: SecurityDetermination.CONFIRMED_MISSING,
          header,
        });
      }
    }

    mixedContentResourceCount += page.mixedContentResourceCount;
    const mixedContent = page.mixedContentResourceCount > 0;
    addCheck(
      checks,
      "MIXED_CONTENT",
      page.url,
      mixedContent
        ? SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION
        : SecurityDetermination.OBSERVED_CONFIGURATION,
      { resourceCount: page.mixedContentResourceCount },
    );
    if (mixedContent) {
      addFindingEvidence("SEC_MIXED_CONTENT", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
        resourceCount: page.mixedContentResourceCount,
        resources: page.mixedContentResources.slice(
          0,
          SECURITY_RULE_THRESHOLDS.maximumCookieEvidencePerPage,
        ),
        evidenceTruncated:
          page.mixedContentResources.length >
          SECURITY_RULE_THRESHOLDS.maximumCookieEvidencePerPage,
      });
    }

    const server = headers.server;
    addCheck(
      checks,
      "SERVER_DISCLOSURE",
      page.url,
      server
        ? SecurityDetermination.OBSERVED_CONFIGURATION
        : SecurityDetermination.NOT_APPLICABLE,
      {
        header: "server",
        value: server
          ? bounded(
              server,
              SECURITY_RULE_THRESHOLDS.maximumTechnologyValueLength,
            )
          : null,
      },
    );
    if (server) {
      addFindingEvidence("SEC_SERVER_HEADER_DISCLOSURE", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_CONFIGURATION,
        header: "server",
        value: bounded(
          server,
          SECURITY_RULE_THRESHOLDS.maximumTechnologyValueLength,
        ),
      });
    }

    const technologyEvidence = technologyHeaders.flatMap((header) => {
      const value = headers[header];
      return value
        ? [
            {
              source: "HEADER",
              name: header,
              value: bounded(
                value,
                SECURITY_RULE_THRESHOLDS.maximumTechnologyValueLength,
              ),
            },
          ]
        : [];
    });
    if (html.generator) {
      technologyEvidence.push({
        source: "HTML_META",
        name: "generator",
        value: html.generator,
      });
    }
    addCheck(
      checks,
      "TECHNOLOGY_DISCLOSURE",
      page.url,
      technologyEvidence.length > 0
        ? SecurityDetermination.OBSERVED_CONFIGURATION
        : SecurityDetermination.NOT_APPLICABLE,
      { disclosures: technologyEvidence },
    );
    for (const disclosure of technologyEvidence) {
      addFindingEvidence("SEC_TECHNOLOGY_DISCLOSURE", {
        url: page.url,
        determination: SecurityDetermination.OBSERVED_CONFIGURATION,
        ...disclosure,
      });
    }

    if (page.setCookieHeaders.length === 0) {
      addCheck(
        checks,
        "COOKIE_ATTRIBUTES",
        page.url,
        SecurityDetermination.NOT_APPLICABLE,
        { reason: "No Set-Cookie header was observed." },
      );
    }
    for (const cookieHeader of page.setCookieHeaders.slice(
      0,
      SECURITY_RULE_THRESHOLDS.maximumCookieEvidencePerPage,
    )) {
      observedCookieCount += 1;
      const cookie = parseCookie(cookieHeader);
      if (!cookie) {
        addCheck(
          checks,
          "COOKIE_ATTRIBUTES",
          page.url,
          SecurityDetermination.CANNOT_DETERMINE,
          { reason: "The Set-Cookie header could not be parsed safely." },
        );
        continue;
      }
      const sameSiteNoneWithoutSecure =
        cookie.sameSite === "NONE" && !cookie.secure;
      const determination = cookie.secure
        ? SecurityDetermination.OBSERVED_CONFIGURATION
        : sameSiteNoneWithoutSecure
          ? SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION
          : SecurityDetermination.CONFIRMED_MISSING;
      const cookieEvidence = {
        cookieName: cookie.name,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
      };
      addCheck(
        checks,
        "COOKIE_ATTRIBUTES",
        page.url,
        determination,
        cookieEvidence,
      );
      if (sameSiteNoneWithoutSecure) {
        addFindingEvidence("SEC_COOKIE_SAMESITE_NONE_INSECURE", {
          url: page.url,
          determination: SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION,
          ...cookieEvidence,
        });
      } else if (!cookie.secure) {
        addFindingEvidence("SEC_COOKIE_SECURE_MISSING", {
          url: page.url,
          determination: SecurityDetermination.CONFIRMED_MISSING,
          ...cookieEvidence,
        });
      }
    }
  }

  const matches = [...evidenceByRule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([ruleCode, evidence]) => {
      const match = aggregateMatch(ruleCode, evidence);
      return match ? [match] : [];
    });
  const findings = sortAuditRuleResults(createSecurityRuleResults(matches));
  const determinationCounts = Object.fromEntries(
    Object.values(SecurityDetermination).map((determination) => [
      determination,
      checks.filter((check) => check.determination === determination).length,
    ]),
  ) as Record<SecurityDetermination, number>;

  return {
    findings,
    checks,
    evaluatedPageCount: evaluatedPages.length,
    metrics: [
      {
        category: "SECURITY",
        key: "security.pages_evaluated",
        value: evaluatedPages.length,
        unit: "pages",
      },
      {
        category: "SECURITY",
        key: "security.tls_available_observed",
        value: input.transport.tlsAvailability === "AVAILABLE" ? 1 : 0,
        unit: "boolean",
      },
      {
        category: "SECURITY",
        key: "security.http_to_https_observed",
        value:
          input.transport.httpToHttpsBehavior === "REDIRECTS_TO_HTTPS" ? 1 : 0,
        unit: "boolean",
      },
      {
        category: "SECURITY",
        key: "security.observed_configuration_checks",
        value:
          determinationCounts[SecurityDetermination.OBSERVED_CONFIGURATION],
        unit: "checks",
      },
      {
        category: "SECURITY",
        key: "security.confirmed_missing_checks",
        value: determinationCounts[SecurityDetermination.CONFIRMED_MISSING],
        unit: "checks",
      },
      {
        category: "SECURITY",
        key: "security.observed_insecure_checks",
        value:
          determinationCounts[
            SecurityDetermination.OBSERVED_INSECURE_CONFIGURATION
          ],
        unit: "checks",
      },
      {
        category: "SECURITY",
        key: "security.unknown_checks",
        value: determinationCounts[SecurityDetermination.CANNOT_DETERMINE],
        unit: "checks",
      },
      {
        category: "SECURITY",
        key: "security.cookies_observed",
        value: observedCookieCount,
        unit: "cookies",
      },
      {
        category: "SECURITY",
        key: "security.mixed_content_resources",
        value: mixedContentResourceCount,
        unit: "resources",
      },
    ],
  };
}
