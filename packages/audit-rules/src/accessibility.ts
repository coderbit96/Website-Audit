import {
  AuditRuleSeverity,
  materializeAuditRuleResults,
  sortAuditRuleResults,
  type AuditRuleResult,
  type AuditRuleSeverity as AuditRuleSeverityValue,
} from "@website-audit/audit-core";

import {
  ACCESSIBILITY_RULE_DEFINITIONS,
  ACCESSIBILITY_RULE_THRESHOLDS,
} from "./accessibility-rules.js";

export type AccessibilityViolationNode = {
  target: readonly string[];
  html: string;
  failureSummary: string | null;
};

export type AccessibilityViolationInput = {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  help: string;
  description: string;
  helpUrl: string;
  nodes: readonly AccessibilityViolationNode[];
};

export type AccessibilityPageInput = {
  url: string;
  violations: readonly AccessibilityViolationInput[];
};

const axeIdsByRule = new Map<string, string>([
  ["image-alt", "ACCESS_IMAGE_ALT_MISSING"],
  ["input-image-alt", "ACCESS_IMAGE_ALT_MISSING"],
  ["label", "ACCESS_FORM_LABEL_MISSING"],
  ["label-content-name-mismatch", "ACCESS_FORM_LABEL_MISSING"],
  ["label-title-only", "ACCESS_FORM_LABEL_MISSING"],
  ["select-name", "ACCESS_FORM_LABEL_MISSING"],
  ["button-name", "ACCESS_BUTTON_NAME_MISSING"],
  ["input-button-name", "ACCESS_BUTTON_NAME_MISSING"],
  ["link-name", "ACCESS_LINK_NAME_MISSING"],
  ["html-has-lang", "ACCESS_HTML_LANG_INVALID"],
  ["html-lang-valid", "ACCESS_HTML_LANG_INVALID"],
  ["html-xml-lang-mismatch", "ACCESS_HTML_LANG_INVALID"],
  ["heading-order", "ACCESS_HEADING_STRUCTURE"],
  ["empty-heading", "ACCESS_HEADING_STRUCTURE"],
  ["page-has-heading-one", "ACCESS_HEADING_STRUCTURE"],
  ["frame-title", "ACCESS_IFRAME_TITLE_MISSING"],
  ["frame-title-unique", "ACCESS_IFRAME_TITLE_MISSING"],
  ["duplicate-id", "ACCESS_DUPLICATE_ID"],
  ["duplicate-id-active", "ACCESS_DUPLICATE_ID"],
  ["duplicate-id-aria", "ACCESS_DUPLICATE_ID"],
  ["table-fake-caption", "ACCESS_TABLE_SEMANTICS"],
  ["td-headers-attr", "ACCESS_TABLE_SEMANTICS"],
  ["td-has-header", "ACCESS_TABLE_SEMANTICS"],
  ["th-has-data-cells", "ACCESS_TABLE_SEMANTICS"],
  ["scope-attr-valid", "ACCESS_TABLE_SEMANTICS"],
  ["table-duplicate-name", "ACCESS_TABLE_SEMANTICS"],
  ["table-same-caption-summary", "ACCESS_TABLE_SEMANTICS"],
  ["empty-table-header", "ACCESS_TABLE_SEMANTICS"],
  ["layout-table", "ACCESS_TABLE_SEMANTICS"],
  ["color-contrast", "ACCESS_COLOR_CONTRAST"],
  ["color-contrast-enhanced", "ACCESS_COLOR_CONTRAST"],
]);

function ruleCodeForAxeId(axeId: string): string | null {
  const direct = axeIdsByRule.get(axeId);
  if (direct) return direct;
  if (
    axeId.startsWith("aria-") ||
    axeId === "role-img-alt" ||
    axeId === "presentation-role-conflict"
  ) {
    return "ACCESS_ARIA_INVALID";
  }
  return null;
}

function severityForImpact(
  impact: AccessibilityViolationInput["impact"],
): AuditRuleSeverityValue | undefined {
  if (impact === "critical") return AuditRuleSeverity.CRITICAL;
  if (impact === "serious" || impact === "moderate") {
    return AuditRuleSeverity.WARNING;
  }
  if (impact === "minor") return AuditRuleSeverity.RECOMMENDATION;
  return undefined;
}

function boundedText(value: string, maximum: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function analyzeAccessibilityPages(
  pages: readonly AccessibilityPageInput[],
): { findings: AuditRuleResult[] } {
  const matches = [...pages]
    .sort((left, right) => left.url.localeCompare(right.url))
    .flatMap((page) =>
      [...page.violations]
        .sort((left, right) => left.id.localeCompare(right.id))
        .flatMap((violation) => {
          const ruleCode = ruleCodeForAxeId(violation.id);
          if (!ruleCode || violation.nodes.length === 0) return [];
          const evidenceNodes = violation.nodes
            .slice(0, ACCESSIBILITY_RULE_THRESHOLDS.maximumEvidenceNodes)
            .map((node) => ({
              target: [...node.target],
              html: boundedText(
                node.html,
                ACCESSIBILITY_RULE_THRESHOLDS.maximumHtmlEvidenceLength,
              ),
              failureSummary: node.failureSummary
                ? boundedText(
                    node.failureSummary,
                    ACCESSIBILITY_RULE_THRESHOLDS.maximumFailureSummaryLength,
                  )
                : null,
            }));
          const firstTarget = evidenceNodes[0]?.target.join(" ");
          const severity = severityForImpact(violation.impact);
          return [
            {
              ruleCode,
              affectedUrl: page.url,
              title: violation.help,
              evidence: {
                axeRuleId: violation.id,
                axeImpact: violation.impact,
                axeDescription: boundedText(violation.description, 1_000),
                helpUrl: violation.helpUrl,
                nodes: evidenceNodes,
                nodeCount: violation.nodes.length,
                evidenceTruncated:
                  violation.nodes.length > evidenceNodes.length,
              },
              ...(severity ? { severity } : {}),
              ...(firstTarget ? { affectedElement: firstTarget } : {}),
              occurrences: violation.nodes.length,
            },
          ];
        }),
    );

  return {
    findings: sortAuditRuleResults(
      materializeAuditRuleResults(ACCESSIBILITY_RULE_DEFINITIONS, matches),
    ),
  };
}
