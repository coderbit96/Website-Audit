import assert from "node:assert/strict";
import test from "node:test";

import {
  runAccessibilityBrowserAudit,
  selectAccessibilityBrowserCandidates,
  type AccessibilityBrowserCandidate,
} from "./browser-audit.js";

function candidate(
  index: number,
  overrides: Partial<AccessibilityBrowserCandidate> = {},
): AccessibilityBrowserCandidate {
  const url = `https://example.com/page-${index}`;
  return {
    url,
    normalizedUrl: url,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    ...overrides,
  };
}

test("selects only successful HTML pages within the hard browser limit", () => {
  const pages = [
    candidate(1),
    candidate(2, { statusCode: 404 }),
    candidate(3, { contentType: "application/pdf" }),
    candidate(4),
    candidate(5),
  ];
  const selected = selectAccessibilityBrowserCandidates(pages, 2);

  assert.deepEqual(
    selected.map((page) => page.url),
    [pages[0]?.url, pages[3]?.url],
  );
});

test("runs injected axe analysis only for capped candidates and reports coverage", async () => {
  const pages = Array.from({ length: 12 }, (_, index) => candidate(index));
  const requestedUrls: string[] = [];
  const report = await runAccessibilityBrowserAudit(
    {
      pages,
      pageLimit: 3,
      signal: new AbortController().signal,
    },
    async (urls) => {
      requestedUrls.push(...urls);
      return {
        failedPageCount: 0,
        pages: urls.map((url) => ({
          url,
          violations: [
            {
              id: "button-name",
              impact: "serious",
              help: "Buttons must have discernible text",
              description: "A button has no accessible name.",
              helpUrl: "https://dequeuniversity.com/rules/axe/button-name",
              nodes: [
                {
                  target: ["button"],
                  html: "<button></button>",
                  failureSummary: "Add an accessible name.",
                },
              ],
            },
          ],
        })),
      };
    },
  );

  assert.equal(requestedUrls.length, 3);
  assert.equal(report.candidatePageCount, 12);
  assert.equal(report.selectedPageCount, 3);
  assert.equal(report.analyzedPageCount, 3);
  assert.equal(report.failedPageCount, 0);
  assert.equal(report.truncated, true);
  assert.equal(report.findings.length, 3);
});

test("does not claim accessibility evaluation when browser analysis fails", async () => {
  const report = await runAccessibilityBrowserAudit(
    {
      pages: [candidate(1), candidate(2)],
      pageLimit: 2,
      signal: new AbortController().signal,
    },
    async () => {
      throw new Error("Browser unavailable");
    },
  );

  assert.equal(report.analyzedPageCount, 0);
  assert.equal(report.failedPageCount, 2);
  assert.deepEqual(report.findings, []);
});

test("propagates cancellation instead of converting it into an unavailable result", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Audit cancelled"));

  await assert.rejects(
    runAccessibilityBrowserAudit({
      pages: [candidate(1)],
      pageLimit: 1,
      signal: controller.signal,
    }),
    /Audit cancelled/,
  );
});
