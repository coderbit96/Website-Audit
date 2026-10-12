import {
  AuditRuleCategory,
  AuditRuleSeverity,
  materializeAuditRuleResults,
  type AuditRuleDefinition,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

type SecuritySeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const SECURITY_RULE_THRESHOLDS = Object.freeze({
  maximumEvidenceUrls: 100,
  maximumCookieEvidencePerPage: 25,
  maximumHeaderValueLength: 500,
  maximumTechnologyValueLength: 200,
});

function defineSecurityRule(input: {
  code: string;
  name: string;
  defaultSeverity: SecuritySeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.SECURITY,
    enabled: true,
  });
}

export const SECURITY_RULE_DEFINITIONS = Object.freeze([
  defineSecurityRule({
    code: "SEC_HTTPS_NOT_USED",
    name: "Pages are served without HTTPS",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description:
      "One or more observed pages were served over unencrypted HTTP.",
    recommendation:
      "Serve every page through HTTPS with a valid certificate and update internal links to use HTTPS URLs.",
    scoreWeight: 10,
  }),
  defineSecurityRule({
    code: "SEC_HTTP_TO_HTTPS_MISSING",
    name: "HTTP does not redirect to HTTPS",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "A passive request to the HTTP endpoint returned without upgrading to HTTPS.",
    recommendation:
      "Configure a direct permanent redirect from HTTP to the equivalent HTTPS destination.",
    scoreWeight: 8,
  }),
  defineSecurityRule({
    code: "SEC_HSTS_MISSING",
    name: "HSTS header is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Strict-Transport-Security was not present on one or more observed HTTPS HTML responses.",
    recommendation:
      "After confirming the site works fully over HTTPS, send an appropriate Strict-Transport-Security header on HTTPS responses.",
    scoreWeight: 6,
  }),
  defineSecurityRule({
    code: "SEC_HSTS_INVALID",
    name: "HSTS is not effectively enabled",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Strict-Transport-Security was observed, but its max-age was missing, invalid, or zero.",
    recommendation:
      "Configure Strict-Transport-Security with a positive max-age after validating HTTPS coverage.",
    scoreWeight: 6,
  }),
  defineSecurityRule({
    code: "SEC_CSP_MISSING",
    name: "Content Security Policy is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "No enforcing Content-Security-Policy header or HTML policy was observed on one or more HTML pages.",
    recommendation:
      "Deploy a tested Content Security Policy that permits only the resources required by the application.",
    scoreWeight: 7,
  }),
  defineSecurityRule({
    code: "SEC_X_CONTENT_TYPE_OPTIONS_MISSING",
    name: "X-Content-Type-Options is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "X-Content-Type-Options was not present on one or more observed HTML responses.",
    recommendation: "Send X-Content-Type-Options: nosniff.",
    scoreWeight: 5,
  }),
  defineSecurityRule({
    code: "SEC_X_CONTENT_TYPE_OPTIONS_INVALID",
    name: "X-Content-Type-Options is not effective",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "X-Content-Type-Options was observed with a value other than nosniff.",
    recommendation: "Set X-Content-Type-Options to nosniff.",
    scoreWeight: 5,
  }),
  defineSecurityRule({
    code: "SEC_FRAME_PROTECTION_MISSING",
    name: "Frame embedding protection is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Neither a valid X-Frame-Options value nor a CSP frame-ancestors directive was observed.",
    recommendation:
      "Use a Content-Security-Policy frame-ancestors directive and, where compatibility requires it, X-Frame-Options.",
    scoreWeight: 6,
  }),
  defineSecurityRule({
    code: "SEC_X_FRAME_OPTIONS_INVALID",
    name: "X-Frame-Options is not effective",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "X-Frame-Options was observed with an unsupported value and no enforcing CSP frame-ancestors alternative was present.",
    recommendation:
      "Use DENY or SAMEORIGIN, or configure an appropriate Content-Security-Policy frame-ancestors directive.",
    scoreWeight: 5,
  }),
  defineSecurityRule({
    code: "SEC_REFERRER_POLICY_MISSING",
    name: "Referrer Policy is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Referrer-Policy was not present on one or more observed HTML responses.",
    recommendation:
      "Set a Referrer-Policy appropriate for the application’s navigation and analytics requirements.",
    scoreWeight: 4,
  }),
  defineSecurityRule({
    code: "SEC_PERMISSIONS_POLICY_MISSING",
    name: "Permissions Policy is missing",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Permissions-Policy was not present on one or more observed HTML responses.",
    recommendation:
      "Define a Permissions-Policy that disables browser capabilities the application does not require.",
    scoreWeight: 3,
  }),
  defineSecurityRule({
    code: "SEC_MIXED_CONTENT",
    name: "Mixed-content resources are referenced",
    defaultSeverity: AuditRuleSeverity.CRITICAL,
    description:
      "HTTPS pages reference one or more resources through insecure HTTP URLs.",
    recommendation:
      "Load every resource through HTTPS and remove insecure HTTP references.",
    scoreWeight: 9,
  }),
  defineSecurityRule({
    code: "SEC_SERVER_HEADER_DISCLOSURE",
    name: "Server header discloses implementation information",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "A Server response header was observed. This is an information disclosure, not proof of a vulnerability.",
    recommendation:
      "Remove unnecessary server product or version details where the platform permits it.",
    scoreWeight: 2,
  }),
  defineSecurityRule({
    code: "SEC_TECHNOLOGY_DISCLOSURE",
    name: "Technology details are disclosed",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Response headers or HTML metadata expose potential implementation details. This observation does not establish a vulnerability.",
    recommendation:
      "Remove unnecessary technology and version disclosures while retaining headers required for operation.",
    scoreWeight: 3,
  }),
  defineSecurityRule({
    code: "SEC_COOKIE_SECURE_MISSING",
    name: "Cookie Secure attribute is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "An observed Set-Cookie header did not include the Secure attribute.",
    recommendation:
      "Set the Secure attribute on cookies and deliver them only through HTTPS.",
    scoreWeight: 7,
  }),
  defineSecurityRule({
    code: "SEC_COOKIE_SAMESITE_NONE_INSECURE",
    name: "SameSite=None cookie is missing Secure",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "An observed cookie uses SameSite=None without the required Secure attribute.",
    recommendation:
      "Add Secure to SameSite=None cookies, or use a stricter SameSite mode when cross-site delivery is unnecessary.",
    scoreWeight: 7,
  }),
]);

export function createSecurityRuleResults(
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  return materializeAuditRuleResults(SECURITY_RULE_DEFINITIONS, matches);
}
