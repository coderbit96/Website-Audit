import assert from "node:assert/strict";
import test from "node:test";

import {
  markAllNotificationsReadSchema,
  markNotificationReadSchema,
  parseNotificationPage,
} from "./validation.js";

test("parses a bounded notification page", () => {
  assert.equal(parseNotificationPage("3"), 3);
  assert.equal(parseNotificationPage(["4", "8"]), 4);
  assert.equal(parseNotificationPage("0"), 1);
  assert.equal(parseNotificationPage("10001"), 1);
  assert.equal(parseNotificationPage("not-a-page"), 1);
});

test("accepts only explicit notification read operations", () => {
  assert.equal(
    markNotificationReadSchema.safeParse({ action: "read" }).success,
    true,
  );
  assert.equal(
    markAllNotificationsReadSchema.safeParse({ action: "read_all" }).success,
    true,
  );
  assert.equal(
    markNotificationReadSchema.safeParse({ action: "read", userId: "other" })
      .success,
    false,
  );
  assert.equal(
    markAllNotificationsReadSchema.safeParse({ action: "delete_all" }).success,
    false,
  );
});
