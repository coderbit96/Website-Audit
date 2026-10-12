"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { CurrentAccount } from "../../lib/auth/current-user";
import { getDashboardItemByPath } from "../../lib/dashboard/navigation";
import {
  NOTIFICATION_COUNT_EVENT,
  type NotificationCountEventDetail,
} from "../../lib/notifications/events";
import { LogoutButton } from "../auth/logout-button";
import { DashboardIcon } from "./dashboard-icon";
import { ThemeToggle } from "./theme-toggle";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function TopHeader({
  account,
  initialUnreadNotificationCount,
  isMobileNavigationOpen,
  onOpenMobileNavigation,
}: {
  account: CurrentAccount;
  initialUnreadNotificationCount: number;
  isMobileNavigationOpen: boolean;
  onOpenMobileNavigation: () => void;
}) {
  const pathname = usePathname();
  const currentItem = getDashboardItemByPath(pathname);
  const [unreadCount, setUnreadCount] = useState(
    initialUnreadNotificationCount,
  );
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateCount = (event: Event) => {
      const detail = (event as CustomEvent<NotificationCountEventDetail>)
        .detail;
      if (typeof detail?.count === "number") {
        setUnreadCount(Math.max(0, Math.floor(detail.count)));
      }
    };
    window.addEventListener(NOTIFICATION_COUNT_EVENT, updateCount);
    return () =>
      window.removeEventListener(NOTIFICATION_COUNT_EVENT, updateCount);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const headerElement: HTMLElement = header;

    function closeMenu(menu: HTMLDetailsElement, restoreFocus: boolean): void {
      menu.open = false;
      if (restoreFocus) {
        menu.querySelector<HTMLElement>("summary")?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!(event.target instanceof Node)) return;
      for (const menu of headerElement.querySelectorAll<HTMLDetailsElement>(
        "details.header-menu[open]",
      )) {
        if (!menu.contains(event.target)) closeMenu(menu, false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      const activeMenu =
        document.activeElement instanceof Element
          ? document.activeElement.closest<HTMLDetailsElement>(
              "details.header-menu[open]",
            )
          : null;
      if (activeMenu) {
        event.preventDefault();
        closeMenu(activeMenu, true);
        return;
      }

      const openMenus = headerElement.querySelectorAll<HTMLDetailsElement>(
        "details.header-menu[open]",
      );
      if (openMenus.length > 0) {
        event.preventDefault();
        for (const menu of openMenus) closeMenu(menu, false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleMenuToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    const openedMenu = event.currentTarget;
    if (!openedMenu.open) return;
    for (const menu of headerRef.current?.querySelectorAll<HTMLDetailsElement>(
      "details.header-menu[open]",
    ) ?? []) {
      if (menu !== openedMenu) menu.open = false;
    }
  }

  return (
    <header className="app-header" ref={headerRef}>
      <div className="app-header-start">
        <button
          className="header-icon-button mobile-menu-button"
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMobileNavigationOpen}
          aria-controls="dashboard-mobile-navigation"
          data-tooltip="Open navigation"
          onClick={onOpenMobileNavigation}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <nav className="app-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/dashboard">Workspace</Link>
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="m6 3 5 5-5 5" />
          </svg>
          <span aria-current="page">{currentItem?.label ?? "Dashboard"}</span>
        </nav>
      </div>

      <div className="app-header-actions">
        <details
          className="header-menu workspace-menu"
          onToggle={handleMenuToggle}
        >
          <summary aria-label={`Workspace: ${account.workspace.name}`}>
            <span className="workspace-mini-avatar">
              {account.workspace.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="workspace-summary-name">
              {account.workspace.name}
            </span>
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </summary>
          <div className="header-popover workspace-popover">
            <p>Current workspace</p>
            <div className="workspace-option">
              <span className="workspace-mini-avatar">
                {account.workspace.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{account.workspace.name}</strong>
                <small>{account.workspace.role.toLowerCase()}</small>
              </span>
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="m3 8 3 3 7-7" />
              </svg>
            </div>
            <p className="popover-note">
              Additional workspace switching will be enabled with workspace
              management.
            </p>
          </div>
        </details>

        <ThemeToggle />

        <Link
          className="header-icon-button header-notification-link"
          href="/dashboard/notifications"
          data-tooltip="Notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <DashboardIcon name="notifications" />
          {unreadCount > 0 ? (
            <span className="header-notification-count" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>

        <details
          className="header-menu profile-menu"
          onToggle={handleMenuToggle}
        >
          <summary aria-label="Open profile menu" data-tooltip="Profile">
            <span className="profile-avatar">{getInitials(account.name)}</span>
          </summary>
          <div className="header-popover profile-popover">
            <div className="profile-popover-heading">
              <span className="profile-avatar">
                {getInitials(account.name)}
              </span>
              <span>
                <strong>{account.name}</strong>
                <small>{account.email}</small>
              </span>
            </div>
            <div className="profile-popover-links">
              <Link href="/dashboard/settings">
                <DashboardIcon name="settings" />
                Account settings
              </Link>
              <Link href="/dashboard/support">
                <DashboardIcon name="support" />
                Help and support
              </Link>
              <LogoutButton className="profile-logout" />
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
