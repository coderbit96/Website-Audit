import assert from "node:assert/strict";
import test from "node:test";

import {
  runMobileBrowserAudit,
  selectMobileBrowserCandidates,
  type MobileBrowserCandidate,
} from "./browser-audit.js";

function candidate(
  index: number,
  overrides: Partial<MobileBrowserCandidate> = {},
): MobileBrowserCandidate {
  const url = `https://example.com/page-${index}`;
  return {
    url,
    normalizedUrl: url,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    ...overrides,
  };
}

test("selects only unique successful HTML pages within the mobile cap", () => {
  const pages = [
    candidate(1),
    candidate(2, { statusCode: 404 }),
    candidate(3, { contentType: "application/pdf" }),
    candidate(4),
    candidate(5),
  ];
  assert.deepEqual(
    selectMobileBrowserCandidates(pages, 2).map((page) => page.url),
    [pages[0]?.url, pages[3]?.url],
  );
});

test("runs injected mobile analysis only for the bounded page sample", async () => {
  const pages = Array.from({ length: 10 }, (_, index) => candidate(index));
  const requested: string[] = [];
  const report = await runMobileBrowserAudit(
    {
      pages,
      pageLimit: 3,
      signal: new AbortController().signal,
    },
    async (urls) => {
      requested.push(...urls);
      return {
        failedPageCount: 0,
        pages: urls.map((url) => ({
          url,
          viewportWidth: 390,
          documentWidth: 400,
          layoutReliable: true,
          blockedLayoutResourceCount: 0,
          overflowElements: [],
          overflowingImages: [],
          touchTargets: [],
          measuredTextCharacters: 200,
          smallTextCharacters: 0,
          smallTextSamples: [],
        })),
      };
    },
  );

  assert.equal(requested.length, 3);
  assert.equal(report.analyzedPageCount, 3);
  assert.equal(report.failedPageCount, 0);
  assert.equal(report.truncated, true);
});

test("keeps browser failure unavailable instead of inventing observations", async () => {
  const report = await runMobileBrowserAudit(
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
  assert.deepEqual(report.pages, []);
});

test("propagates explicit audit cancellation", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Audit cancelled"));
  await assert.rejects(
    runMobileBrowserAudit({
      pages: [candidate(1)],
      pageLimit: 1,
      signal: controller.signal,
    }),
    /Audit cancelled/,
  );
});
