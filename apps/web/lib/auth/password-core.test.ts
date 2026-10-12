import assert from "node:assert/strict";
import test from "node:test";

import { hashPasswordValue, verifyPasswordValue } from "./password-core.js";

test("hashes passwords with Argon2id and a unique salt", async () => {
  const password = "SecurePassword1";
  const firstHash = await hashPasswordValue(password);
  const secondHash = await hashPasswordValue(password);

  assert.match(firstHash, /^\$argon2id\$/);
  assert.notEqual(firstHash, password);
  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPasswordValue(firstHash, password), true);
});

test("rejects incorrect passwords and malformed hashes", async () => {
  const hash = await hashPasswordValue("SecurePassword1");

  assert.equal(await verifyPasswordValue(hash, "WrongPassword1"), false);
  assert.equal(
    await verifyPasswordValue("not-a-valid-hash", "anything"),
    false,
  );
});
