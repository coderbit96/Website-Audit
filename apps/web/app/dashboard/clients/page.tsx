import type { Metadata } from "next";

import { ClientManager } from "../../../components/clients/client-manager";
import { ClientUpgradeState } from "../../../components/clients/client-upgrade-state";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import {
  canManageClients,
  listWorkspaceClients,
} from "../../../lib/clients/service";
import { getWorkspacePlanContext } from "../../../lib/entitlements/service";

export const metadata: Metadata = { title: "Clients | SiteSignal" };

export default async function ClientsPage() {
  const account = await requireCurrentAccount();
  const plan = await getWorkspacePlanContext(account.workspace.id);
  if (!plan.entitlements.features.clients) {
    return <ClientUpgradeState plan={plan.plan} />;
  }
  const clients = await listWorkspaceClients(account, "all");
  return (
    <ClientManager
      initialClients={clients}
      canManage={canManageClients(account)}
      clientLimit={plan.entitlements.limits.clients}
    />
  );
}
