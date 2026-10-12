import assert from "node:assert/strict";
import test from "node:test";

import {
  DuplicateEmailError,
  registerPersonalAccount,
  type RegistrationAccount,
  type RegistrationDependencies,
} from "./registration-core.js";
import { loginSchema, registerSchema } from "./validation.js";

function createDependencies(
  overrides: Partial<RegistrationDependencies> = {},
): RegistrationDependencies & { created: RegistrationAccount[] } {
  const created: RegistrationAccount[] = [];

  return {
    created,
    emailExists: async () => false,
    hashPassword: async (password) => `hashed:${password}`,
    createWorkspaceSlug: () => "alex-workspace-12345678",
    createAccount: async (account) => {
      created.push(account);
      return { userId: "user-1", workspaceId: "workspace-1" };
    },
    ...overrides,
  };
}

test("normalizes registration data and never passes a plain password", async () => {
  const dependencies = createDependencies();

  const result = await registerPersonalAccount(
    {
      name: "  Alex Rivera  ",
      email: "  ALEX@Example.COM ",
      password: "SecurePassword1",
    },
    dependencies,
  );

  assert.deepEqual(result, { userId: "user-1", workspaceId: "workspace-1" });
  assert.deepEqual(dependencies.created, [
    {
      name: "Alex Rivera",
      email: "alex@example.com",
      passwordHash: "hashed:SecurePassword1",
      workspaceName: "Alex Rivera's Workspace",
      workspaceSlug: "alex-workspace-12345678",
    },
  ]);
  assert.equal("password" in dependencies.created[0]!, false);
});

test("rejects a known duplicate before hashing", async () => {
  let hashWasCalled = false;
  const dependencies = createDependencies({
    emailExists: async () => true,
    hashPassword: async () => {
      hashWasCalled = true;
      return "unused";
    },
  });

  await assert.rejects(
    registerPersonalAccount(
      { name: "Alex", email: "alex@example.com", password: "Password1234" },
      dependencies,
    ),
    DuplicateEmailError,
  );
  assert.equal(hashWasCalled, false);
});

test("maps a concurrent unique-index conflict to a duplicate email error", async () => {
  const dependencies = createDependencies({
    createAccount: async () => {
      throw { code: 11000 };
    },
  });

  await assert.rejects(
    registerPersonalAccount(
      { name: "Alex", email: "alex@example.com", password: "Password1234" },
      dependencies,
    ),
    DuplicateEmailError,
  );
});

test("validates credential and registration form boundaries", () => {
  assert.equal(
    loginSchema.safeParse({
      email: "person@example.com",
      password: "anything",
    }).success,
    true,
  );
  assert.equal(
    registerSchema.safeParse({
      name: "Person",
      email: "person@example.com",
      password: "weak",
      confirmPassword: "different",
    }).success,
    false,
  );
});
