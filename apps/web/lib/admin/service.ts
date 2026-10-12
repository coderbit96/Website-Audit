import "server-only";

import {
  getAdminOverview,
  getAdminTableData,
  grantOfflineUsageCredit,
  listAdminCreditRecipients,
  type AdminSection,
} from "@website-audit/database";
import {
  ACCESSIBILITY_RULE_DEFINITIONS,
  MOBILE_RULE_DEFINITIONS,
  PERFORMANCE_RULE_DEFINITIONS,
  SECURITY_RULE_DEFINITIONS,
  SEO_RULE_DEFINITIONS,
  TECHNICAL_RULE_DEFINITIONS,
} from "@website-audit/audit-rules";

import type { CurrentAccount } from "../auth/current-user";
import { isSuperAdmin } from "../auth/permissions";
import type { GrantOfflineCreditInput } from "./validation";

function assertSuperAdmin(account: CurrentAccount): void {
  if (!isSuperAdmin(account)) {
    throw new Error("Super Admin access is required.");
  }
}

export function getSuperAdminOverview(account: CurrentAccount) {
  assertSuperAdmin(account);
  return getAdminOverview();
}

export function getSuperAdminTable(
  account: CurrentAccount,
  section: AdminSection,
  page = 1,
) {
  assertSuperAdmin(account);
  return getAdminTableData(section, page);
}

export function getSuperAdminCreditRecipients(
  account: CurrentAccount,
  search = "",
) {
  assertSuperAdmin(account);
  return listAdminCreditRecipients(search);
}

export function grantSuperAdminOfflineCredit(
  account: CurrentAccount,
  input: GrantOfflineCreditInput,
) {
  assertSuperAdmin(account);
  return grantOfflineUsageCredit({
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    recipientUserId: input.recipientUserId,
    grantedById: account.id,
    metric: input.metric,
    quantity: input.quantity,
    ...(input.note ? { note: input.note } : {}),
  });
}

const auditRuleDefinitions = [
  ...SEO_RULE_DEFINITIONS,
  ...TECHNICAL_RULE_DEFINITIONS,
  ...PERFORMANCE_RULE_DEFINITIONS,
  ...ACCESSIBILITY_RULE_DEFINITIONS,
  ...SECURITY_RULE_DEFINITIONS,
  ...MOBILE_RULE_DEFINITIONS,
];

export function getSuperAdminAuditRules(account: CurrentAccount) {
  assertSuperAdmin(account);
  return auditRuleDefinitions
    .map((rule) => ({
      code: rule.code,
      name: rule.name,
      category: rule.category,
      severity: rule.defaultSeverity,
      scoreWeight: rule.scoreWeight,
      enabled: rule.enabled,
    }))
    .sort((first, second) => first.code.localeCompare(second.code));
}
