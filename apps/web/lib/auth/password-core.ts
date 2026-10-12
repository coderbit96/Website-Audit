import argon2 from "argon2";

const options = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPasswordValue(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPasswordValue(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
