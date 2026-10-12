import assert from "node:assert/strict";
import test from "node:test";

import {
  clientFieldsSchema,
  clientListStatusSchema,
  updateClientSchema,
} from "./validation.js";

test("normalizes optional client contact fields", () => {
  const result = clientFieldsSchema.parse({
    companyName: "  North Star Studio  ",
    contactName: "  Joy Ghosh ",
    email: "  HELLO@EXAMPLE.COM ",
    phone: " +91 98765 43210 ",
    notes: "  Retainer client. ",
  });

  assert.deepEqual(result, {
    companyName: "North Star Studio",
    contactName: "Joy Ghosh",
    email: "hello@example.com",
    phone: "+91 98765 43210",
    notes: "Retainer client.",
  });
});

test("turns blank optional client fields into undefined", () => {
  const result = clientFieldsSchema.parse({
    companyName: "Example Ltd",
    contactName: " ",
    email: "",
    phone: "",
    notes: "  ",
  });
  assert.equal(result.contactName, undefined);
  assert.equal(result.email, undefined);
  assert.equal(result.phone, undefined);
  assert.equal(result.notes, undefined);
});

test("rejects invalid emails, phones, extra fields, and duplicate websites", () => {
  assert.equal(
    clientFieldsSchema.safeParse({ companyName: "A", secret: true }).success,
    false,
  );
  assert.equal(
    clientFieldsSchema.safeParse({
      companyName: "Example Ltd",
      email: "not-an-email",
    }).success,
    false,
  );
  assert.equal(
    clientFieldsSchema.safeParse({
      companyName: "Example Ltd",
      phone: "call me maybe",
    }).success,
    false,
  );
  const id = "507f1f77bcf86cd799439011";
  assert.equal(
    updateClientSchema.safeParse({
      operation: "websites",
      websiteIds: [id, id],
    }).success,
    false,
  );
});

test("accepts only supported client status and mutation operations", () => {
  assert.equal(clientListStatusSchema.safeParse("archived").success, true);
  assert.equal(clientListStatusSchema.safeParse("deleted").success, false);
  assert.equal(
    updateClientSchema.safeParse({ operation: "archive" }).success,
    true,
  );
  assert.equal(
    updateClientSchema.safeParse({ operation: "delete" }).success,
    false,
  );
});
