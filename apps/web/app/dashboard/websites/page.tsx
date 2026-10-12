import type { Metadata } from "next";

import { WebsiteManager } from "../../../components/websites/website-manager";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import {
  canManageWebsites,
  listWorkspaceWebsites,
} from "../../../lib/websites/service";

export const metadata: Metadata = {
  title: "Websites | SiteSignal",
};

export default async function WebsitesPage() {
  const account = await requireCurrentAccount();
  const websites = await listWorkspaceWebsites(account, "all");

  return (
    <WebsiteManager
      initialWebsites={websites}
      canManage={canManageWebsites(account)}
    />
  );
}
