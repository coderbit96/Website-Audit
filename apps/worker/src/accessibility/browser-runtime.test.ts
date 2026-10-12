import assert from "node:assert/strict";
import test from "node:test";

import axe from "axe-core";
import { chromium } from "playwright";

test(
  "runs the installed axe-core inside Playwright Chromium",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        "<!doctype html><html><body><button></button><img></body></html>",
      );
      await page.addScriptTag({ content: axe.source });
      const violationIds = await page.evaluate(async () => {
        const browserGlobal = globalThis as unknown as {
          axe: {
            run: (
              context: unknown,
              options: unknown,
            ) => Promise<{ violations: { id: string }[] }>;
          };
          document: unknown;
        };
        const results = await browserGlobal.axe.run(browserGlobal.document, {
          runOnly: {
            type: "rule",
            values: ["button-name", "image-alt", "html-has-lang"],
          },
          resultTypes: ["violations"],
        });
        return results.violations.map((violation) => violation.id).sort();
      });

      assert.deepEqual(violationIds, [
        "button-name",
        "html-has-lang",
        "image-alt",
      ]);
    } finally {
      await browser.close();
    }
  },
);
