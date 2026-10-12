export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export class RegistrationError extends Error {
  constructor(message = "Unable to create your account right now.") {
    super(message);
    this.name = "RegistrationError";
  }
}

export type RegistrationAccount = {
  name: string;
  email: string;
  passwordHash: string;
  workspaceName: string;
  workspaceSlug: string;
};

export type RegistrationResult = {
  userId: string;
  workspaceId: string;
};

export type RegistrationDependencies = {
  emailExists(email: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  createAccount(account: RegistrationAccount): Promise<RegistrationResult>;
  createWorkspaceSlug(name: string): string;
};

export async function registerPersonalAccount(
  input: { name: string; email: string; password: string },
  dependencies: RegistrationDependencies,
): Promise<RegistrationResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (await dependencies.emailExists(email)) {
    throw new DuplicateEmailError();
  }

  const passwordHash = await dependencies.hashPassword(input.password);

  try {
    return await dependencies.createAccount({
      name,
      email,
      passwordHash,
      workspaceName: `${name}'s Workspace`,
      workspaceSlug: dependencies.createWorkspaceSlug(name),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new DuplicateEmailError();
    }

    throw error;
  }
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
