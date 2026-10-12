import {
  AuditRuleCategory,
  AuditRuleSeverity,
  materializeAuditRuleResults,
  type AuditRuleDefinition,
  type AuditRuleMatch,
  type AuditRuleResult,
} from "@website-audit/audit-core";

type MobileSeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const MOBILE_RULE_THRESHOLDS = Object.freeze({
  horizontalOverflowTolerancePixels: 2,
  minimumReadableFontPixels: 12,
  minimumMeasuredTextCharacters: 100,
  smallTextCharacterRatio: 0.4,
  maximumEvidenceItems: 25,
  maximumEvidenceStringLength: 500,
});

export const MOBILE_SCORE_COMPONENT_WEIGHTS = Object.freeze({
  rules: 0.6,
  pageSpeed: 0.4,
});

function defineMobileRule(input: {
  code: string;
  name: string;
  defaultSeverity: MobileSeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.MOBILE,
    enabled: true,
  });
}

export const MOBILE_RULE_DEFINITIONS = Object.freeze([
  defineMobileRule({
    code: "MOBILE_VIEWPORT_MISSING",
    name: "Mobile viewport metadata is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The page does not declare viewport metadata, so mobile browsers may use a desktop-sized layout viewport.",
    recommendation:
      "Add a viewport meta tag with a valid width directive, normally width=device-width, and an appropriate initial scale.",
    scoreWeight: 9,
  }),
  defineMobileRule({
    code: "MOBILE_VIEWPORT_INVALID",
    name: "Mobile viewport metadata is invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The observed viewport metadata lacks a usable width directive or sets an initial scale below one.",
    recommendation:
      "Use a valid viewport declaration such as width=device-width, initial-scale=1.",
    scoreWeight: 8,
  }),
  defineMobileRule({
    code: "MOBILE_HORIZONTAL_OVERFLOW",
    name: "Document overflows the mobile viewport",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "A rendered mobile page is wider than its viewport and creates document-level horizontal overflow.",
    recommendation:
      "Constrain wide layout elements, tables, media, and fixed-width containers to the available viewport width.",
    scoreWeight: 8,
  }),
  defineMobileRule({
    code: "MOBILE_IMAGE_OVERFLOW",
    name: "Images overflow the mobile viewport",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more rendered images extend beyond the measured mobile viewport.",
    recommendation:
      "Use responsive image markup and CSS constraints such as max-width: 100% while preserving intrinsic dimensions.",
    scoreWeight: 6,
  }),
  defineMobileRule({
    code: "MOBILE_TOUCH_TARGET_SIZE",
    name: "Touch targets need more size or spacing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Axe detected interactive targets that do not satisfy its reliably testable target-size or spacing criteria in the mobile viewport.",
    recommendation:
      "Increase the rendered target area or spacing around affected controls while keeping their accessible names and behavior intact.",
    scoreWeight: 7,
  }),
  defineMobileRule({
    code: "MOBILE_TEXT_READABILITY",
    name: "A substantial share of text renders very small",
    defaultSeverity: AuditRuleSeverity.RECOMMENDATION,
    description:
      "Measured visible text contains enough characters below the configured mobile readability threshold to warrant review.",
    recommendation:
      "Increase the computed font size for the affected mobile text and verify readability at the measured viewport width.",
    scoreWeight: 4,
  }),
]);

export function createMobileRuleResults(
  matches: readonly AuditRuleMatch[],
): AuditRuleResult[] {
  return materializeAuditRuleResults(MOBILE_RULE_DEFINITIONS, matches);
}
