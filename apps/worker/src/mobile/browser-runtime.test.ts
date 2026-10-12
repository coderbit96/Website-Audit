import assert from "node:assert/strict";
import test from "node:test";

import axe from "axe-core";
import { chromium } from "playwright";

test(
  "runs axe target-size checks in the installed mobile browser runtime",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      });
      await page.setContent(`<!doctype html><html lang="en"><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>button { width: 10px; height: 10px; padding: 0; margin: 0; }</style>
      </head><body><button>A</button><button>B</button></body></html>`);
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
          runOnly: { type: "rule", values: ["target-size"] },
          resultTypes: ["violations"],
        });
        return results.violations.map((violation) => violation.id);
      });
      assert.deepEqual(violationIds, ["target-size"]);
    } finally {
      await browser.close();
    }
  },
);
