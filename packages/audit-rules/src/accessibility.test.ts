import assert from "node:assert/strict";
import test from "node:test";

import { ACCESSIBILITY_RULE_THRESHOLDS } from "./accessibility-rules.js";
import {
  analyzeAccessibilityPages,
  type AccessibilityViolationInput,
} from "./accessibility.js";

const requestedAxeRules = [
  ["image-alt", "ACCESS_IMAGE_ALT_MISSING"],
  ["label", "ACCESS_FORM_LABEL_MISSING"],
  ["button-name", "ACCESS_BUTTON_NAME_MISSING"],
  ["link-name", "ACCESS_LINK_NAME_MISSING"],
  ["aria-valid-attr", "ACCESS_ARIA_INVALID"],
  ["html-has-lang", "ACCESS_HTML_LANG_INVALID"],
  ["heading-order", "ACCESS_HEADING_STRUCTURE"],
  ["frame-title", "ACCESS_IFRAME_TITLE_MISSING"],
  ["duplicate-id-aria", "ACCESS_DUPLICATE_ID"],
  ["td-headers-attr", "ACCESS_TABLE_SEMANTICS"],
  ["color-contrast", "ACCESS_COLOR_CONTRAST"],
] as const;

function violation(
  id: string,
  overrides: Partial<AccessibilityViolationInput> = {},
): AccessibilityViolationInput {
  return {
    id,
    impact: "serious",
    help: `${id} needs correction`,
    description: `A deterministic description for ${id}.`,
    helpUrl: `https://dequeuniversity.com/rules/axe/${id}`,
    nodes: [
      {
        target: ["#target"],
        html: '<div id="target">Example</div>',
        failureSummary: "Fix the target element.",
      },
    ],
    ...overrides,
  };
}

test("maps every requested accessibility class to standardized findings", () => {
  const report = analyzeAccessibilityPages([
    {
      url: "https://example.com/",
      violations: requestedAxeRules.map(([axeId]) => violation(axeId)),
    },
  ]);
  const codes = new Set(report.findings.map((finding) => finding.ruleCode));

  assert.deepEqual(codes, new Set(requestedAxeRules.map(([, code]) => code)));
  for (const finding of report.findings) {
    assert.equal(finding.category, "ACCESSIBILITY");
    assert.equal(finding.affectedUrl, "https://example.com/");
    assert.ok(finding.evidence.axeRuleId);
    assert.equal(finding.occurrences, 1);
  }
});

test("is deterministic, severity-aware, bounded, and ignores unrelated axe rules", () => {
  const nodes = Array.from(
    { length: ACCESSIBILITY_RULE_THRESHOLDS.maximumEvidenceNodes + 5 },
    (_, index) => ({
      target: [`#image-${index}`],
      html: `<img id="image-${index}">`,
      failureSummary: "Image needs alternative text.",
    }),
  );
  const input = [
    {
      url: "https://example.com/",
      violations: [
        violation("region"),
        violation("image-alt", { impact: "critical", nodes }),
      ],
    },
  ];
  const first = analyzeAccessibilityPages(input);
  const second = analyzeAccessibilityPages(input);

  assert.deepEqual(first, second);
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0]?.severity, "CRITICAL");
  assert.equal(first.findings[0]?.occurrences, nodes.length);
  assert.equal(
    (first.findings[0]?.evidence.nodes as unknown[]).length,
    ACCESSIBILITY_RULE_THRESHOLDS.maximumEvidenceNodes,
  );
  assert.equal(first.findings[0]?.evidence.evidenceTruncated, true);
});
