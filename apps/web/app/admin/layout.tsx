import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AdminNavigation } from "../../components/admin/admin-navigation";
import { requireCurrentAccount } from "../../lib/auth/current-user";
import { isSuperAdmin } from "../../lib/auth/permissions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await requireCurrentAccount();
  if (!isSuperAdmin(account)) notFound();

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main-content">
        Skip to main content
      </a>
      <AdminNavigation />
      <main className="admin-main" id="admin-main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
