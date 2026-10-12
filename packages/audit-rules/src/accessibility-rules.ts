import {
  AuditRuleCategory,
  AuditRuleSeverity,
  type AuditRuleDefinition,
} from "@website-audit/audit-core";

type AccessibilitySeverity = Exclude<AuditRuleSeverity, "PASSED">;

export const ACCESSIBILITY_RULE_THRESHOLDS = Object.freeze({
  maximumEvidenceNodes: 20,
  maximumHtmlEvidenceLength: 500,
  maximumFailureSummaryLength: 1_000,
});

function defineAccessibilityRule(input: {
  code: string;
  name: string;
  defaultSeverity: AccessibilitySeverity;
  description: string;
  recommendation: string;
  scoreWeight: number;
}): AuditRuleDefinition {
  return Object.freeze({
    ...input,
    category: AuditRuleCategory.ACCESSIBILITY,
    enabled: true,
  });
}

export const ACCESSIBILITY_RULE_DEFINITIONS = Object.freeze([
  defineAccessibilityRule({
    code: "ACCESS_IMAGE_ALT_MISSING",
    name: "Image alternative text is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more meaningful images do not have an accessible text alternative.",
    recommendation:
      "Add concise alternative text to meaningful images and use an empty alt attribute only for decorative images.",
    scoreWeight: 7,
  }),
  defineAccessibilityRule({
    code: "ACCESS_FORM_LABEL_MISSING",
    name: "Form control label is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more form controls do not have a programmatically associated accessible label.",
    recommendation:
      "Associate every form control with a visible label or another valid accessible name.",
    scoreWeight: 7,
  }),
  defineAccessibilityRule({
    code: "ACCESS_BUTTON_NAME_MISSING",
    name: "Button accessible name is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more buttons cannot be identified by assistive technology.",
    recommendation:
      "Give every button a descriptive visible label or valid accessible name.",
    scoreWeight: 7,
  }),
  defineAccessibilityRule({
    code: "ACCESS_LINK_NAME_MISSING",
    name: "Link accessible name is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more links do not expose a meaningful accessible name.",
    recommendation:
      "Give every link descriptive text or another valid accessible name that explains its destination.",
    scoreWeight: 6,
  }),
  defineAccessibilityRule({
    code: "ACCESS_ARIA_INVALID",
    name: "ARIA usage is invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "ARIA roles, attributes, or required relationships are invalid or incomplete.",
    recommendation:
      "Use native HTML semantics where possible and correct invalid ARIA roles, attributes, values, and relationships.",
    scoreWeight: 8,
  }),
  defineAccessibilityRule({
    code: "ACCESS_HTML_LANG_INVALID",
    name: "Document language is missing or invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The document does not expose a valid primary language to assistive technology.",
    recommendation:
      "Add a valid BCP 47 lang attribute to the root HTML element and keep XML language declarations consistent.",
    scoreWeight: 5,
  }),
  defineAccessibilityRule({
    code: "ACCESS_HEADING_STRUCTURE",
    name: "Heading structure needs correction",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "The page contains empty headings or heading levels that do not form a logical structure.",
    recommendation:
      "Use meaningful headings in a logical hierarchy without skipping levels for visual styling.",
    scoreWeight: 5,
  }),
  defineAccessibilityRule({
    code: "ACCESS_IFRAME_TITLE_MISSING",
    name: "Iframe title is missing",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "One or more frames do not expose a descriptive title to assistive technology.",
    recommendation:
      "Add a concise, unique title attribute that describes the purpose of each iframe.",
    scoreWeight: 5,
  }),
  defineAccessibilityRule({
    code: "ACCESS_DUPLICATE_ID",
    name: "Document IDs are duplicated",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Duplicate element IDs can make labels and ARIA relationships resolve to the wrong element.",
    recommendation:
      "Make every ID unique and update all label, fragment, and ARIA references to the correct ID.",
    scoreWeight: 6,
  }),
  defineAccessibilityRule({
    code: "ACCESS_TABLE_SEMANTICS",
    name: "Table semantics are invalid",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "A data table does not expose reliable headers, captions, scope, or cell relationships.",
    recommendation:
      "Use semantic table markup with appropriate caption, header cells, scope, and header relationships.",
    scoreWeight: 6,
  }),
  defineAccessibilityRule({
    code: "ACCESS_COLOR_CONTRAST",
    name: "Text color contrast is insufficient",
    defaultSeverity: AuditRuleSeverity.WARNING,
    description:
      "Rendered text does not meet the reliably testable WCAG color-contrast threshold.",
    recommendation:
      "Increase the contrast between foreground text and its rendered background while preserving readable states.",
    scoreWeight: 8,
  }),
]);
