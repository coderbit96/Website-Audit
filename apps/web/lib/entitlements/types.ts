import type { PlanTier, UsageMetric } from "@website-audit/shared";

export type UsageLimitDetails = {
  metric: UsageMetric;
  used: number;
  limit: number;
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
  resetAt: string | null;
};

export type UsageLimitApiError = {
  error: string;
  fieldErrors?: undefined;
  code: string;
  plan: PlanTier;
  metric: UsageMetric;
  used: number;
  limit: number;
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
  resetAt: string | null;
  upgradeRequired: true;
  usage: UsageLimitDetails;
};
