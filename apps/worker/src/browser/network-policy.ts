import type { BrowserContext } from "playwright";

/** Browser HTTP requests are checked separately; audit pages never need WebSockets. */
export async function blockAuditWebSockets(
  context: BrowserContext,
): Promise<void> {
  await context.routeWebSocket(/.*/, (socket) =>
    socket.close({ code: 1008, reason: "Audit network policy" }),
  );
}
