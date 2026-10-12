import "server-only";

import { hashPasswordValue, verifyPasswordValue } from "./password-core";

export function hashPassword(password: string): Promise<string> {
  return hashPasswordValue(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verifyPasswordValue(passwordHash, password);
}
