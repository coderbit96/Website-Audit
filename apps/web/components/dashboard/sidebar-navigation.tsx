"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNavigation } from "../../lib/dashboard/navigation";
import type { CurrentAccount } from "../../lib/auth/current-user";
import { DashboardIcon } from "./dashboard-icon";

export function SidebarNavigation({
  account,
  onNavigate,
}: {
  account: CurrentAccount;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="app-sidebar-nav" aria-label="Dashboard navigation">
      {dashboardNavigation.map((group) => {
        const items = group.items.filter(
          (item) => !item.adminOnly || account.role === "SUPER_ADMIN",
        );
        if (items.length === 0) return null;
        return (
          <div className="app-nav-group" key={group.label}>
            <p>{group.label}</p>
            <ul>
              {items.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      className="app-nav-link"
                      data-active={isActive || undefined}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      {...(onNavigate ? { onClick: onNavigate } : {})}
                    >
                      <DashboardIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
