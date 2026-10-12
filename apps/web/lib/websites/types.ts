export type WebsiteView = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  lastAuditedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteApiSuccess<T> = {
  data: T;
};

export type WebsiteApiError =
  | {
      error: string;
      fieldErrors?: Partial<Record<"name" | "url", string[]>>;
    }
  | UsageLimitApiError;
import type { UsageLimitApiError } from "../entitlements/types";
