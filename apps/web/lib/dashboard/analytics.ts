import "server-only";

import { getWorkspaceDashboardAnalytics } from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";

/** Loads stored, workspace-authorized dashboard totals. */
export function getDashboardAnalytics(account: CurrentAccount) {
  return getWorkspaceDashboardAnalytics({ workspaceId: account.workspace.id });
}
