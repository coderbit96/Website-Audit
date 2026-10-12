import type { Metadata } from "next";

import { NotificationCenter } from "../../../components/notifications/notification-center";
import { requireCurrentAccount } from "../../../lib/auth/current-user";
import { listAccountNotifications } from "../../../lib/notifications/service";
import { parseNotificationPage } from "../../../lib/notifications/validation";

export const metadata: Metadata = { title: "Notifications | SiteSignal" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const page = parseNotificationPage((await searchParams).page);
  const notifications = await listAccountNotifications(account, page);
  return <NotificationCenter initialPage={notifications} />;
}
