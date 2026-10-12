import assert from "node:assert/strict";
import test from "node:test";

import { grantOfflineCreditSchema, parseAdminPage } from "./validation.js";

const ids = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  workspaceId: "507f1f77bcf86cd799439011",
  recipientUserId: "507f191e810c19729de860ea",
};

test("accepts bounded offline usage credits", () => {
  const result = grantOfflineCreditSchema.safeParse({
    ...ids,
    metric: "PAGES_CRAWLED",
    quantity: 500,
    note: "Manual goodwill allowance",
  });
  assert.equal(result.success, true);
});

test("rejects invalid offline usage credits", () => {
  assert.equal(
    grantOfflineCreditSchema.safeParse({
      ...ids,
      metric: "PAGES_CRAWLED",
      quantity: -2,
    }).success,
    false,
  );
  assert.equal(
    grantOfflineCreditSchema.safeParse({
      ...ids,
      metric: "UNKNOWN",
      quantity: 1,
    }).success,
    false,
  );
  assert.equal(
    grantOfflineCreditSchema.safeParse({
      ...ids,
      requestId: "not-a-uuid",
      metric: "AUDITS",
      quantity: 1,
    }).success,
    false,
  );
});

test("admin pagination accepts only bounded whole page numbers", () => {
  assert.equal(parseAdminPage("2"), 2);
  assert.equal(parseAdminPage("0"), 1);
  assert.equal(parseAdminPage("1.5"), 1);
  assert.equal(parseAdminPage("1001"), 1);
  assert.equal(parseAdminPage(["2", "3"]), 1);
});
