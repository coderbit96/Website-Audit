import Link from "next/link";

import type { CurrentAccount } from "../../lib/auth/current-user";
import { SidebarNavigation } from "./sidebar-navigation";

export function Sidebar({
  account,
  onNavigate,
}: {
  account: CurrentAccount;
  onNavigate?: () => void;
}) {
  return (
    <div className="app-sidebar-inner">
      <Link
        className="app-brand"
        href="/dashboard"
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        <span className="app-brand-mark">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 17V7m5 10v-4m5 4V9m5 8V4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span>
          <strong>SiteSignal</strong>
          <small>Website intelligence</small>
        </span>
      </Link>

      <div className="sidebar-workspace">
        <span className="workspace-avatar">
          {account.workspace.name.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong>{account.workspace.name}</strong>
          <small>{account.workspace.role.toLowerCase()} workspace</small>
        </span>
      </div>

      <SidebarNavigation
        account={account}
        {...(onNavigate ? { onNavigate } : {})}
      />

      <div className="sidebar-status">
        <span className="status-dot" />
        <div>
          <strong>Workspace secured</strong>
          <span>Audit pipeline is ready</span>
        </div>
      </div>
    </div>
  );
}
