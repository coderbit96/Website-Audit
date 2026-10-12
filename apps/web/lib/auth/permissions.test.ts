import assert from "node:assert/strict";
import test from "node:test";

import type { CurrentAccount } from "./current-user.js";
import { isSuperAdmin } from "./permissions.js";

function account(role: CurrentAccount["role"]): CurrentAccount {
  return {
    id: "507f1f77bcf86cd799439011",
    name: "Test User",
    email: "test@example.com",
    role,
    workspace: {
      id: "507f1f77bcf86cd799439012",
      name: "Test workspace",
      role: "OWNER",
    },
  };
}

test("reserves Super Admin access for the explicit global SUPER_ADMIN role", () => {
  assert.equal(isSuperAdmin(account("SUPER_ADMIN")), true);
  assert.equal(isSuperAdmin(account("ADMIN")), false);
  assert.equal(isSuperAdmin(account("USER")), false);
});
