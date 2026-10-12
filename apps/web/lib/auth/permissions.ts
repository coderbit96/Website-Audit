import type { CurrentAccount } from "./current-user";

export function canManageWorkspace(account: CurrentAccount): boolean {
  return (
    account.workspace.role === "OWNER" || account.workspace.role === "ADMIN"
  );
}

/** Only the explicit global SUPER_ADMIN role can access system administration. */
export function isSuperAdmin(account: CurrentAccount): boolean {
  return account.role === "SUPER_ADMIN";
}
