import {
  getEntitlements,
  PlanTier,
  type PlanTier as PlanTierValue,
} from "./plan-entitlements.js";

/** Authoritative INR one-month purchase prices in minor units (paise). */
export const PLAN_DISPLAY = {
  [PlanTier.FREE]: { name: "Free", monthlyPriceCents: 0 },
  [PlanTier.PRO]: { name: "Pro", monthlyPriceCents: 99_900 },
  [PlanTier.AGENCY]: { name: "For Agency", monthlyPriceCents: 299_900 },
} as const satisfies Record<
  PlanTierValue,
  { name: string; monthlyPriceCents: number }
>;

export function getPlanDisplay(plan: PlanTierValue) {
  return { ...PLAN_DISPLAY[plan], entitlements: getEntitlements(plan) };
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatPlanMonthlyPrice(plan: PlanTierValue): string {
  return inrFormatter.format(PLAN_DISPLAY[plan].monthlyPriceCents / 100);
}
