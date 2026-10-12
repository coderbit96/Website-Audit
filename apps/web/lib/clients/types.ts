import type {
  AuditStatus,
  AuditType,
  ReportGenerationStatus,
} from "@website-audit/database";
import type { UsageLimitApiError } from "../entitlements/types";

export type ClientView = {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  websiteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClientWebsiteView = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  selected: boolean;
};

export type ClientAuditView = {
  id: string;
  website: { id: string; name: string };
  status: AuditStatus;
  type: AuditType;
  overallScore: number | null;
  pagesCrawled: number;
  createdAt: string;
  completedAt: string | null;
};

export type ClientReportView = {
  id: string;
  auditId: string;
  title: string;
  format: string;
  status: ReportGenerationStatus;
  websiteName: string;
  createdAt: string;
  generatedAt: string | null;
};

export type ClientDetailView = {
  client: ClientView;
  websites: ClientWebsiteView[];
  audits: ClientAuditView[];
  reports: ClientReportView[];
};

export type ClientApiError =
  | {
      error: string;
      fieldErrors?: Partial<
        Record<
          "companyName" | "contactName" | "email" | "phone" | "notes",
          string[]
        >
      >;
    }
  | UsageLimitApiError;
