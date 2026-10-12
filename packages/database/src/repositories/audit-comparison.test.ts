import assert from "node:assert/strict";
import test from "node:test";

import { AuditCategory, FindingSeverity } from "../enums.js";
import {
  compareAuditFindings,
  compareAuditPages,
  createFindingIdentity,
  normalizeComparisonUrl,
  type ComparableFinding,
} from "./audit-comparison.js";

function finding(
  ruleCode: string,
  affectedUrl: string | null,
  severity: (typeof FindingSeverity)[keyof typeof FindingSeverity],
  occurrences = 1,
): ComparableFinding {
  return {
    ruleCode,
    affectedUrl,
    severity,
    occurrences,
    category: AuditCategory.SEO,
    title: ruleCode,
  };
}

test("creates stable finding identities from rule codes and affected URLs", () => {
  assert.equal(
    normalizeComparisonUrl("https://EXAMPLE.com/page?b=2&a=1#section"),
    "https://example.com/page?a=1&b=2",
  );
  assert.equal(
    createFindingIdentity(
      " seo_title_missing ",
      "https://example.com/page?a=1&b=2",
    ),
    createFindingIdentity(
      "SEO_TITLE_MISSING",
      "https://EXAMPLE.com/page?b=2&a=1#heading",
    ),
  );
  assert.notEqual(
    createFindingIdentity("SEO_TITLE_MISSING", null),
    createFindingIdentity("SEO_TITLE_MISSING", "https://example.com/"),
  );
});

test("classifies new, existing, resolved, and regressed findings", () => {
  const result = compareAuditFindings(
    [
      finding("EXISTING", "https://example.com/a", FindingSeverity.WARNING),
      finding("RESOLVED", "https://example.com/b", FindingSeverity.CRITICAL),
      finding("WORSENED", "https://example.com/c", FindingSeverity.WARNING),
      finding("EXPANDED", null, FindingSeverity.RECOMMENDATION, 2),
      finding("PASSED_CHECK", null, FindingSeverity.PASSED),
    ],
    [
      finding("EXISTING", "https://example.com/a#top", FindingSeverity.WARNING),
      finding("NEW", "https://example.com/d", FindingSeverity.CRITICAL),
      finding("WORSENED", "https://example.com/c", FindingSeverity.CRITICAL),
      finding("EXPANDED", null, FindingSeverity.RECOMMENDATION, 4),
    ],
  );

  assert.deepEqual(result.counts, {
    NEW: 1,
    EXISTING: 1,
    RESOLVED: 1,
    REGRESSION: 2,
  });
  assert.equal(result.previews.NEW[0]?.ruleCode, "NEW");
  assert.equal(result.previews.RESOLVED[0]?.ruleCode, "RESOLVED");
  assert.deepEqual(
    result.previews.REGRESSION.map((item) => item.ruleCode).sort(),
    ["EXPANDED", "WORSENED"],
  );
});

test("compares page membership by normalized URL", () => {
  const result = compareAuditPages(
    [
      { normalizedUrl: "https://example.com/", url: "https://example.com/" },
      {
        normalizedUrl: "https://example.com/removed",
        url: "https://example.com/removed",
      },
    ],
    [
      {
        normalizedUrl: "https://example.com/#home",
        url: "https://example.com/#home",
      },
      {
        normalizedUrl: "https://example.com/added",
        url: "https://example.com/added",
      },
    ],
  );

  assert.deepEqual(
    result.added.map((page) => page.normalizedUrl),
    ["https://example.com/added"],
  );
  assert.deepEqual(
    result.removed.map((page) => page.normalizedUrl),
    ["https://example.com/removed"],
  );
});
