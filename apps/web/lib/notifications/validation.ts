import { z } from "zod";

export const notificationPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(10_000);

export function parseNotificationPage(
  value: string | string[] | undefined,
): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = notificationPageSchema.safeParse(first ?? "1");
  return parsed.success ? parsed.data : 1;
}

export const markNotificationReadSchema = z
  .object({ action: z.literal("read") })
  .strict();

export const markAllNotificationsReadSchema = z
  .object({ action: z.literal("read_all") })
  .strict();
