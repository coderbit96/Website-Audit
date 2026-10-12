import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageDetail } from "../../../../../../components/pages/page-detail";
import { requireCurrentAccount } from "../../../../../../lib/auth/current-user";
import { getWorkspacePageDetail } from "../../../../../../lib/pages/service";

export const metadata: Metadata = { title: "Crawled page | SiteSignal" };

export default async function AuditPageDetailPage({
  params,
}: {
  params: Promise<{ auditId: string; pageId: string }>;
}) {
  const account = await requireCurrentAccount();
  const { auditId, pageId } = await params;
  const detail = await getWorkspacePageDetail(account, auditId, pageId);
  if (!detail) notFound();

  return <PageDetail detail={detail} />;
}
