import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClientDetail } from "../../../../components/clients/client-detail";
import { ClientUpgradeState } from "../../../../components/clients/client-upgrade-state";
import { requireCurrentAccount } from "../../../../lib/auth/current-user";
import {
  canManageClients,
  getWorkspaceClientDetail,
} from "../../../../lib/clients/service";
import { getWorkspacePlanContext } from "../../../../lib/entitlements/service";

export const metadata: Metadata = { title: "Client | SiteSignal" };

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const account = await requireCurrentAccount();
  const plan = await getWorkspacePlanContext(account.workspace.id);
  if (!plan.entitlements.features.clients) {
    return <ClientUpgradeState plan={plan.plan} />;
  }
  const { clientId } = await params;
  const detail = await getWorkspaceClientDetail(account, clientId);
  if (!detail) notFound();
  return (
    <ClientDetail
      initialDetail={detail}
      canManage={canManageClients(account)}
    />
  );
}
