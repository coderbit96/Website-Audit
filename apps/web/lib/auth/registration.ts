import "server-only";

import {
  createPersonalAccountRecords,
  userEmailExists,
} from "@website-audit/database";
import { randomUUID } from "node:crypto";

import { hashPassword } from "./password";
import {
  registerPersonalAccount,
  type RegistrationResult,
} from "./registration-core";

function createWorkspaceSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);

  return `${base || "workspace"}-${suffix}`;
}

export function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegistrationResult> {
  return registerPersonalAccount(input, {
    emailExists: userEmailExists,
    hashPassword,
    createAccount: createPersonalAccountRecords,
    createWorkspaceSlug,
  });
}
