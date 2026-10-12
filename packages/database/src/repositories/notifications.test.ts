import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTIFICATIONS_PAGE_SIZE,
  SCORE_DROP_NOTIFICATION_THRESHOLD,
  sanitizeNotificationHref,
} from "./notifications.js";

test("accepts only internal dashboard notification links", () => {
  assert.equal(
    sanitizeNotificationHref(" /dashboard/audits/507f1f77bcf86cd799439011 "),
    "/dashboard/audits/507f1f77bcf86cd799439011",
  );
  assert.equal(sanitizeNotificationHref("/dashboard"), "/dashboard");
  assert.equal(
    sanitizeNotificationHref("/dashboard?tab=issues"),
    "/dashboard?tab=issues",
  );
  assert.equal(sanitizeNotificationHref("/dashboard-not-a-route"), undefined);
  assert.equal(sanitizeNotificationHref("https://example.com"), undefined);
  assert.equal(sanitizeNotificationHref("//example.com/dashboard"), undefined);
  assert.equal(sanitizeNotificationHref("/dashboard\\settings"), undefined);
});

test("keeps notification volumes and score-drop signals bounded", () => {
  assert.equal(NOTIFICATIONS_PAGE_SIZE, 20);
  assert.equal(SCORE_DROP_NOTIFICATION_THRESHOLD, 5);
});
