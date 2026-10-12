import { redirect } from "next/navigation";

import { requireCurrentAccount } from "../../lib/auth/current-user";
import { isSuperAdmin } from "../../lib/auth/permissions";

export default async function AccountEntryPage() {
  const account = await requireCurrentAccount();
  redirect(isSuperAdmin(account) ? "/admin" : "/profile");
}
