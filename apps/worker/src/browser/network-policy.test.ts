import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { chromium } from "playwright";

import { blockAuditWebSockets } from "./network-policy.js";

test(
  "browser audit policy blocks WebSockets before they reach a local service",
  { timeout: 30_000 },
  async () => {
    const server = createServer();
    let upgradeCount = 0;
    server.on("upgrade", (_request, socket) => {
      upgradeCount += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      await blockAuditWebSockets(context);
      const page = await context.newPage();
      const closed = await page.evaluate(async (port) => {
        return new Promise<boolean>((resolve, reject) => {
          const socket = new WebSocket(`ws://127.0.0.1:${port}/private`);
          const timeout = setTimeout(
            () => reject(new Error("The WebSocket was not closed.")),
            3_000,
          );
          socket.onopen = () => {
            clearTimeout(timeout);
            resolve(false);
          };
          socket.onclose = () => {
            clearTimeout(timeout);
            resolve(true);
          };
        });
      }, address.port);

      assert.equal(closed, true);
      assert.equal(upgradeCount, 0);
    } finally {
      await browser?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
