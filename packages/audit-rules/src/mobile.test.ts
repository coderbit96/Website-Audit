import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMobileSite,
  calculateMobileCompositeScore,
  validateMobileViewport,
  type MobileBrowserPageObservation,
} from "./mobile.js";

function browserPage(
  overrides: Partial<MobileBrowserPageObservation> = {},
): MobileBrowserPageObservation {
  return {
    url: "https://example.com/",
    viewportWidth: 390,
    documentWidth: 390,
    layoutReliable: true,
    blockedLayoutResourceCount: 0,
    overflowElements: [],
    overflowingImages: [],
    touchTargets: [],
    measuredTextCharacters: 500,
    smallTextCharacters: 0,
    smallTextSamples: [],
    ...overrides,
  };
}

test("validates viewport directives without subjective inference", () => {
  assert.deepEqual(
    validateMobileViewport("width=device-width, initial-scale=1"),
    { valid: true },
  );
  assert.deepEqual(validateMobileViewport("width=390"), { valid: true });
  assert.deepEqual(validateMobileViewport("initial-scale=1"), {
    valid: false,
    reason: "WIDTH_MISSING",
  });
  assert.deepEqual(validateMobileViewport("width=banana"), {
    valid: false,
    reason: "WIDTH_INVALID",
  });
  assert.deepEqual(
    validateMobileViewport("width=device-width, initial-scale=.5"),
    { valid: false, reason: "INITIAL_SCALE_BELOW_ONE" },
  );
});

test("emits every mobile finding only from measured evidence", () => {
  const report = analyzeMobileSite({
    pages: [
      { url: "https://example.com/", viewport: null, images: [] },
      {
        url: "https://example.com/invalid",
        viewport: "initial-scale=1",
        images: [
          { src: "https://example.com/a.jpg", hasResponsiveSource: true },
        ],
      },
    ],
    browserPages: [
      browserPage({
        documentWidth: 520,
        overflowElements: [
          {
            selector: "main > div",
            html: '<div class="wide">',
            left: 0,
            right: 520,
            width: 520,
            height: 20,
          },
        ],
        overflowingImages: [
          {
            selector: "main img",
            html: '<img src="/wide.jpg">',
            left: 0,
            right: 500,
            width: 500,
            height: 200,
          },
        ],
        touchTargets: [
          {
            target: ["#tiny-button"],
            html: '<button id="tiny-button">Go</button>',
            failureSummary: "Target is too small.",
          },
        ],
        measuredTextCharacters: 1_000,
        smallTextCharacters: 450,
        smallTextSamples: [
          {
            selector: ".small",
            fontSizePixels: 10,
            characterCount: 450,
            textSample: "Small rendered text",
          },
        ],
      }),
    ],
    pageSpeedScore: 74,
  });

  assert.deepEqual(
    new Set(report.findings.map((finding) => finding.ruleCode)),
    new Set([
      "MOBILE_VIEWPORT_MISSING",
      "MOBILE_VIEWPORT_INVALID",
      "MOBILE_HORIZONTAL_OVERFLOW",
      "MOBILE_IMAGE_OVERFLOW",
      "MOBILE_TOUCH_TARGET_SIZE",
      "MOBILE_TEXT_READABILITY",
    ]),
  );
  assert.equal(
    report.findings.every((finding) => finding.evidence.details),
    true,
  );
  assert.equal(
    report.metrics.find((metric) => metric.key === "mobile.pagespeed.score")
      ?.value,
    74,
  );
  assert.equal(
    report.metrics.find(
      (metric) => metric.key === "mobile.responsive_image_markup_ratio",
    )?.value,
    1,
  );
});

test("does not claim rendered issues when layout evidence is unreliable", () => {
  const report = analyzeMobileSite({
    pages: [
      {
        url: "https://example.com/",
        viewport: "width=device-width, initial-scale=1",
        images: [{ src: null, hasResponsiveSource: false }],
      },
    ],
    browserPages: [
      browserPage({
        layoutReliable: false,
        blockedLayoutResourceCount: 1,
        documentWidth: 800,
        touchTargets: [
          { target: ["a"], html: "<a>Link</a>", failureSummary: null },
        ],
        measuredTextCharacters: 1_000,
        smallTextCharacters: 1_000,
      }),
    ],
    pageSpeedScore: null,
  });

  assert.deepEqual(report.findings, []);
  assert.equal(report.reliableBrowserPageCount, 0);
  assert.equal(
    report.metrics.some((metric) => metric.key === "mobile.pagespeed.score"),
    false,
  );
});

test("combines only validated rule and mobile PageSpeed scores", () => {
  assert.equal(calculateMobileCompositeScore(80, 50), 68);
  assert.equal(calculateMobileCompositeScore(81.234, null), 81.23);
  assert.throws(() => calculateMobileCompositeScore(-1, 50), /rule score/);
  assert.throws(() => calculateMobileCompositeScore(50, 101), /PageSpeed/);
});
