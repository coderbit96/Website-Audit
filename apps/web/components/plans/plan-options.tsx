import {
  formatPlanMonthlyPrice,
  getPlanDisplay,
  PlanTier,
  type PlanTier as PlanTierValue,
} from "@website-audit/shared";
import Link from "next/link";

import { RazorpayCheckoutButton } from "./razorpay-checkout-button";

const tiers = [PlanTier.FREE, PlanTier.PRO, PlanTier.AGENCY] as const;

export function PlanOptions({
  currentPlan,
  checkoutEnabled = false,
  accountName,
  accountEmail,
}: {
  currentPlan?: PlanTierValue | undefined;
  checkoutEnabled?: boolean;
  accountName?: string;
  accountEmail?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {tiers.map((tier) => {
        const plan = getPlanDisplay(tier);
        const current = currentPlan === tier;
        return (
          <article
            key={tier}
            className={`flex h-full flex-col rounded-3xl border p-6 shadow-xl shadow-black/10 ${current ? "border-cyan-300/60 bg-cyan-300/10" : tier === PlanTier.PRO ? "border-amber-300/45 bg-gradient-to-b from-amber-300/[0.09] to-slate-900/80" : "border-white/10 bg-white/[0.035]"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              {current ? (
                <span className="rounded-full bg-cyan-300/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                  Current plan
                </span>
              ) : null}
            </div>
            <p className="mt-6 text-4xl font-semibold tracking-tight text-white">
              {formatPlanMonthlyPrice(tier)}
              <span className="ml-1 text-sm font-normal text-slate-300">
                {tier === PlanTier.FREE ? " / always free" : " / 1 month"}
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {tier === PlanTier.FREE
                ? "For your first website health check."
                : tier === PlanTier.PRO
                  ? "For growing Indian businesses."
                  : "For agencies managing client sites."}
            </p>
            <ul className="mt-6 flex-1 space-y-3 border-t border-white/10 pt-5 text-sm text-slate-200">
              <li>
                {plan.entitlements.limits.monthlyAudits} account audits / month
              </li>
              <li>
                Up to {plan.entitlements.limits.crawlPagesPerAudit} pages per
                account audit
              </li>
              <li>
                {plan.entitlements.limits.reportGenerations} PDF downloads /
                period
              </li>
              <li>
                {plan.entitlements.limits.websites} saved website
                {plan.entitlements.limits.websites === 1 ? "" : "s"}
              </li>
            </ul>
            {tier !== PlanTier.FREE ? (
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="text-xs leading-5 text-slate-300">
                  One-time INR payment for one month. No automatic renewal.
                </p>
                {checkoutEnabled && accountName && accountEmail ? (
                  <RazorpayCheckoutButton
                    planTier={tier}
                    planName={plan.name}
                    accountName={accountName}
                    accountEmail={accountEmail}
                    renewing={current}
                  />
                ) : (
                  <Link
                    href={accountEmail ? "/contact" : "/profile"}
                    className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                  >
                    {accountEmail
                      ? "Ask about this plan"
                      : "Sign in to choose plan"}
                  </Link>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
