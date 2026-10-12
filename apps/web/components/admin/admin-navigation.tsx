"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminNavigation } from "./admin-links";

export function AdminNavigation() {
  const currentPath = usePathname();
  return (
    <nav className="admin-navigation" aria-label="System administration">
      <Link className="admin-navigation-brand" href="/admin">
        <span aria-hidden="true">S</span>
        <strong>SiteSignal</strong>
        <small>System</small>
      </Link>
      <div>
        {adminNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-current={currentPath === item.href || undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Link className="admin-navigation-exit" href="/profile">
        My profile
      </Link>
    </nav>
  );
}
