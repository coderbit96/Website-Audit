import type { RateLimitRule } from "@website-audit/database";

export type RateLimitAction =
  | "REGISTRATION"
  | "LOGIN"
  | "PASSWORD_RESET"
  | "AUDIT_CREATION"
  | "REPORT_GENERATION"
  | "PAYMENT_ORDER"
  | "PAYMENT_CONFIRMATION"
  | "INVITATION";

export type RateLimitSubjects = {
  globalKey?: string;
  clientKey: string;
  emailKey?: string;
  accountKey?: string;
  workspaceKey?: string;
};

type PolicyDefinition = ReadonlyArray<{
  scope: string;
  subject: keyof RateLimitSubjects;
  windowMs: number;
  limit: number;
}>;

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/** Internal-only policies; the API exposes only a generic retry response. */
const policyDefinitions: Readonly<Record<RateLimitAction, PolicyDefinition>> = {
  REGISTRATION: [
    {
      scope: "REGISTRATION_GLOBAL_MINUTE",
      subject: "globalKey",
      windowMs: minute,
      limit: 30,
    },
    {
      scope: "REGISTRATION_CLIENT_HOUR",
      subject: "clientKey",
      windowMs: hour,
      limit: 4,
    },
    {
      scope: "REGISTRATION_EMAIL_DAY",
      subject: "emailKey",
      windowMs: day,
      limit: 3,
    },
  ],
  LOGIN: [
    {
      scope: "LOGIN_GLOBAL_MINUTE",
      subject: "globalKey",
      windowMs: minute,
      limit: 120,
    },
    {
      scope: "LOGIN_CLIENT_MINUTE",
      subject: "clientKey",
      windowMs: minute,
      limit: 8,
    },
    {
      scope: "LOGIN_EMAIL_HOUR",
      subject: "emailKey",
      windowMs: hour,
      limit: 12,
    },
  ],
  PASSWORD_RESET: [
    {
      scope: "PASSWORD_RESET_GLOBAL_MINUTE",
      subject: "globalKey",
      windowMs: minute,
      limit: 40,
    },
    {
      scope: "PASSWORD_RESET_CLIENT_HOUR",
      subject: "clientKey",
      windowMs: hour,
      limit: 5,
    },
    {
      scope: "PASSWORD_RESET_EMAIL_DAY",
      subject: "emailKey",
      windowMs: day,
      limit: 5,
    },
  ],
  AUDIT_CREATION: [
    {
      scope: "AUDIT_CREATE_CLIENT_HOUR",
      subject: "clientKey",
      windowMs: hour,
      limit: 12,
    },
    {
      scope: "AUDIT_CREATE_ACCOUNT_HOUR",
      subject: "accountKey",
      windowMs: hour,
      limit: 8,
    },
    {
      scope: "AUDIT_CREATE_WORKSPACE_HOUR",
      subject: "workspaceKey",
      windowMs: hour,
      limit: 24,
    },
  ],
  REPORT_GENERATION: [
    {
      scope: "REPORT_CREATE_CLIENT_HOUR",
      subject: "clientKey",
      windowMs: hour,
      limit: 18,
    },
    {
      scope: "REPORT_CREATE_ACCOUNT_HOUR",
      subject: "accountKey",
      windowMs: hour,
      limit: 12,
    },
    {
      scope: "REPORT_CREATE_WORKSPACE_HOUR",
      subject: "workspaceKey",
      windowMs: hour,
      limit: 36,
    },
  ],
  PAYMENT_ORDER: [
    {
      scope: "PAYMENT_ORDER_ACCOUNT_HOUR",
      subject: "accountKey",
      windowMs: hour,
      limit: 6,
    },
    {
      scope: "PAYMENT_ORDER_WORKSPACE_HOUR",
      subject: "workspaceKey",
      windowMs: hour,
      limit: 10,
    },
  ],
  PAYMENT_CONFIRMATION: [
    {
      scope: "PAYMENT_CONFIRMATION_ACCOUNT_MINUTE",
      subject: "accountKey",
      windowMs: minute,
      limit: 12,
    },
    {
      scope: "PAYMENT_CONFIRMATION_WORKSPACE_MINUTE",
      subject: "workspaceKey",
      windowMs: minute,
      limit: 20,
    },
  ],
  INVITATION: [
    {
      scope: "INVITATION_CLIENT_HOUR",
      subject: "clientKey",
      windowMs: hour,
      limit: 12,
    },
    {
      scope: "INVITATION_ACCOUNT_HOUR",
      subject: "accountKey",
      windowMs: hour,
      limit: 10,
    },
    {
      scope: "INVITATION_WORKSPACE_HOUR",
      subject: "workspaceKey",
      windowMs: hour,
      limit: 30,
    },
  ],
};

export function resolveRateLimitRules(
  action: RateLimitAction,
  subjects: RateLimitSubjects,
): readonly RateLimitRule[] {
  return policyDefinitions[action].flatMap((definition) => {
    const keyHash = subjects[definition.subject];
    return keyHash
      ? [
          {
            scope: definition.scope,
            keyHash,
            windowMs: definition.windowMs,
            limit: definition.limit,
          },
        ]
      : [];
  });
}
