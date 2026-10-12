import "server-only";

import {
  createPublicLead,
  LeadRequestedService,
  LeadSource,
  listLeadsForSuperAdmin,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import { isSuperAdmin } from "../auth/permissions";
import {
  createPublicAuditClientKey,
  createPublicLeadAuditKey,
  createPublicLeadEmailKey,
} from "../public-audits/security";
import type {
  LeadListFilterInput,
  PublicLeadRequestInput,
  PublicLeadService,
} from "./validation";

const serviceMapping = {
  "full-report": LeadRequestedService.FULL_REPORT,
  "website-fix": LeadRequestedService.WEBSITE_FIX,
  seo: LeadRequestedService.SEO,
  performance: LeadRequestedService.PERFORMANCE,
  contact: LeadRequestedService.CONTACT,
} as const satisfies Record<PublicLeadService, string>;

export async function capturePublicLead(
  request: Request,
  input: PublicLeadRequestInput,
): Promise<void> {
  await createPublicLead({
    name: input.name,
    email: input.email,
    ...(input.phone ? { phone: input.phone } : {}),
    publicAuditToken: input.auditToken,
    requestedService: serviceMapping[input.requestedService],
    source: LeadSource.PUBLIC_AUDIT,
    clientKeyHash: createPublicAuditClientKey(request),
    emailKeyHash: createPublicLeadEmailKey(input.email),
    auditKeyHash: createPublicLeadAuditKey(input.auditToken),
  });
}

export type SuperAdminLeadListView = Awaited<
  ReturnType<typeof getSuperAdminLeadList>
>;

export async function getSuperAdminLeadList(
  account: CurrentAccount,
  filters: LeadListFilterInput,
) {
  if (!isSuperAdmin(account)) {
    throw new Error("Super Admin access is required.");
  }
  const result = await listLeadsForSuperAdmin({
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.requestedService
      ? { requestedService: serviceMapping[filters.requestedService] }
      : {}),
    ...(filters.source ? { source: LeadSource.PUBLIC_AUDIT } : {}),
    page: filters.page,
    pageSize: 20,
  });
  return {
    ...result,
    items: result.items.map((lead) => ({
      ...lead,
      createdAt: lead.createdAt.toISOString(),
    })),
  };
}
