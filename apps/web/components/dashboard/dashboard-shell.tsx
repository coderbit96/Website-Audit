"use client";

import { useRef, useState, type ReactNode } from "react";

import type { CurrentAccount } from "../../lib/auth/current-user";
import { useModalDialog } from "../../lib/accessibility/use-modal-dialog";
import { Sidebar } from "./sidebar";
import { TopHeader } from "./top-header";

export function DashboardShell({
  account,
  initialUnreadNotificationCount,
  children,
}: {
  account: CurrentAccount;
  initialUnreadNotificationCount: number;
  children: ReactNode;
}) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);

  useModalDialog({
    isOpen: isMobileNavigationOpen,
    onClose: () => setIsMobileNavigationOpen(false),
    dialogRef: mobileNavigationRef,
  });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="desktop-sidebar">
        <Sidebar account={account} />
      </aside>

      <div
        className="mobile-sidebar-layer"
        data-open={isMobileNavigationOpen || undefined}
        aria-hidden={!isMobileNavigationOpen}
        inert={!isMobileNavigationOpen}
      >
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          tabIndex={isMobileNavigationOpen ? 0 : -1}
          onClick={() => setIsMobileNavigationOpen(false)}
        />
        <aside
          ref={mobileNavigationRef}
          id="dashboard-mobile-navigation"
          className="mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard navigation"
          tabIndex={-1}
        >
          <button
            className="mobile-sidebar-close"
            type="button"
            aria-label="Close navigation"
            data-tooltip="Close navigation"
            onClick={() => setIsMobileNavigationOpen(false)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          <Sidebar
            account={account}
            onNavigate={() => setIsMobileNavigationOpen(false)}
          />
        </aside>
      </div>

      <div className="app-main-column">
        <TopHeader
          account={account}
          initialUnreadNotificationCount={initialUnreadNotificationCount}
          isMobileNavigationOpen={isMobileNavigationOpen}
          onOpenMobileNavigation={() => setIsMobileNavigationOpen(true)}
        />
        <main className="app-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
