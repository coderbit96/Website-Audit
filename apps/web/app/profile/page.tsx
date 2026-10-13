import type { Metadata } from "next";
import Link from "next/link";

import { getWorkspaceEntitlementContext } from "@website-audit/database";
import { UsageMetric } from "@website-audit/shared";

import { LogoutButton } from "../../components/auth/logout-button";
import { SiteLogoMark } from "../../components/brand/site-logo";
import { PlanOptions } from "../../components/plans/plan-options";
import { requireCurrentAccount } from "../../lib/auth/current-user";
import { canManageWorkspace, isSuperAdmin } from "../../lib/auth/permissions";
import { getEffectiveUsageLimit } from "../../lib/entitlements/service";
import { getRazorpayCredentials } from "../../lib/payments/razorpay";

export const metadata: Metadata = {
  title: "My profile",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const account = await requireCurrentAccount();
  const plan = await getWorkspaceEntitlementContext(account.workspace.id);
  const monthlyAuditLimit = getEffectiveUsageLimit(
    plan,
    UsageMetric.AUDITS,
    plan.entitlements.limits.monthlyAudits,
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
        <Link
          className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-white"
          href="/"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
            <SiteLogoMark className="size-5" />
          </span>
          <span>SiteSignal</span>
        </Link>
        <nav
          className="flex flex-wrap items-center gap-2"
          aria-label="Profile navigation"
        >
          <Link
            className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            href="/audit"
          >
            Run audit
          </Link>
          {isSuperAdmin(account) ? (
            <Link
              className="rounded-lg px-3 py-2 text-sm text-cyan-200 hover:bg-white/5"
              href="/admin"
            >
              Admin panel
            </Link>
          ) : null}
          <LogoutButton className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5" />
        </nav>
      </header>
      <main
        className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8"
        id="main-content"
        tabIndex={-1}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
          Your account
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Hi, {account.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Enter a website URL to see a real, limited health score. Sign-in
          unlocks PDF downloads; your plan controls account audit and report
          limits.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-sm font-semibold text-slate-300">Profile</h2>
            <p className="mt-4 break-all text-lg font-medium">
              {account.email}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {account.workspace.name}
            </p>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-sm font-semibold text-slate-300">
              Current plan
            </h2>
            <p className="mt-4 text-lg font-medium">{plan.plan}</p>
            <p className="mt-2 text-sm text-slate-400">
              {plan.usage.monthlyAudits} of {monthlyAuditLimit} saved account
              audits used this period
            </p>
            {plan.usage.offlineCredits[UsageMetric.AUDITS] > 0 ? (
              <p className="mt-1 text-xs leading-5 text-cyan-200">
                Includes {plan.usage.offlineCredits[UsageMetric.AUDITS]} extra
                audit credits granted for this period.
              </p>
            ) : null}
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Public five-page snapshots have separate abuse limits. Online
              purchases do not renew automatically.
            </p>
          </section>
        </div>
        <div className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-xl font-semibold">Check a website</h2>
            <p className="mt-2 text-sm text-slate-300">
              No fabricated scores. Results come from the live audit worker.
            </p>
          </div>
          <Link
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-200 sm:mt-0"
            href="/audit"
          >
            Enter website URL
          </Link>
        </div>
        <section className="mt-12" aria-labelledby="plans-heading">
          <h2 className="text-2xl font-semibold" id="plans-heading">
            Plans and limits
          </h2>
          <p className="mt-2 mb-5 text-sm text-slate-400">
            Prices are in Indian rupees for one month of access. Checkout is
            available when Razorpay is configured.
          </p>
          <PlanOptions
            currentPlan={plan.plan}
            checkoutEnabled={
              Boolean(getRazorpayCredentials()) && canManageWorkspace(account)
            }
            accountName={account.name}
            accountEmail={account.email}
          />
        </section>
      </main>
    </div>
  );
}
