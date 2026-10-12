import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { requireCurrentAccount } from "../../lib/auth/current-user";
import { isSuperAdmin } from "../../lib/auth/permissions";
import { getAccountUnreadNotificationCount } from "../../lib/notifications/service";
import { webLogger } from "../../lib/logging/logger";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const account = await requireCurrentAccount();
  if (!isSuperAdmin(account)) redirect("/profile");
  let unreadNotificationCount = 0;
  try {
    unreadNotificationCount = await getAccountUnreadNotificationCount(account);
  } catch (error) {
    webLogger("error", "notification.unread_count_failed", {
      userId: account.id,
      workspaceId: account.workspace.id,
      error,
    });
  }

  return (
    <DashboardShell
      account={account}
      initialUnreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </DashboardShell>
  );
}
