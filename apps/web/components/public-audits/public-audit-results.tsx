"use client";

import Link from "next/link";
import type { PlanTier } from "@website-audit/shared";
import { useEffect, useMemo, useState } from "react";

import type {
  PublicAuditApiError,
  PublicAuditApiSuccess,
  PublicAuditScoreCategory,
  PublicAuditView,
} from "../../lib/public-audits/types";
import {
  publicLeadServiceLabels,
  publicLeadServices,
  type PublicLeadService,
} from "../../lib/leads/validation";
import { PublicLeadForm } from "./public-lead-form";
import { PublicPdfDownload } from "./public-pdf-download";
import { PlanOptions } from "../plans/plan-options";

const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const statusLabels: Record<PublicAuditView["status"], string> = {
  QUEUED: "Queued securely",
  INITIALIZING: "Initializing",
  CRAWLING: "Crawling pages",
  ANALYZING: "Analyzing signals",
  SCORING: "Calculating scores",
  GENERATING_REPORT: "Preparing results",
  COMPLETED: "Free audit complete",
  FAILED: "Audit unavailable",
  CANCELLED: "Audit cancelled",
};
const scoreLabels: Readonly<Record<PublicAuditScoreCategory, string>> = {
  OVERALL: "Overall",
  SEO: "SEO",
  PERFORMANCE: "Performance",
  ACCESSIBILITY: "Accessibility",
  SECURITY: "Security",
};

function scoreColor(score: number): string {
  if (score >= 90) return "#34d399";
  if (score >= 70) return "#22d3ee";
  if (score >= 50) return "#fbbf24";
  return "#fb7185";
}

function PublicScore({
  category,
  score,
  featured = false,
}: {
  category: PublicAuditScoreCategory;
  score: number | null;
  featured?: boolean;
}) {
  const value = score === null ? 0 : Math.round(score);
  const radius = featured ? 42 : 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value / 100);
  return (
    <article
      className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 ${featured ? "sm:col-span-2 lg:col-span-1" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {scoreLabels[category]}
          </p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-white">
            {score === null ? "N/A" : value}
          </strong>
          <span className="text-xs text-slate-400">
            {score === null ? "Not available" : "out of 100"}
          </span>
        </div>
        <svg
          aria-hidden="true"
          className={featured ? "size-24" : "size-20"}
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(148,163,184,.14)"
            strokeWidth="7"
          />
          {score !== null ? (
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={scoreColor(value)}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
            />
          ) : null}
        </svg>
      </div>
    </article>
  );
}

export function PublicAuditResults({
  initialAudit,
  currentPlan,
}: {
  initialAudit: PublicAuditView;
  currentPlan?: PlanTier | undefined;
}) {
  const [audit, setAudit] = useState(initialAudit);
  const [pollError, setPollError] = useState<string>();
  const [requestedService, setRequestedService] = useState<PublicLeadService>();
  const complete = audit.status === "COMPLETED";
  const scoreByCategory = useMemo(
    () => new Map(audit.scores.map((score) => [score.category, score.score])),
    [audit.scores],
  );

  useEffect(() => {
    if (terminalStatuses.has(initialAudit.status)) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll(): Promise<void> {
      try {
        const response = await fetch(
          `/api/public-audits/${initialAudit.token}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as
          PublicAuditApiSuccess<PublicAuditView> | PublicAuditApiError | null;
        if (!response.ok || !payload || !("data" in payload)) {
          throw new Error(
            payload && "error" in payload
              ? payload.error
              : "Results could not be refreshed.",
          );
        }
        setAudit(payload.data);
        setPollError(undefined);
        if (!terminalStatuses.has(payload.data.status)) {
          timer = window.setTimeout(() => void poll(), 2_000);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPollError(
            error instanceof Error
              ? error.message
              : "Results could not be refreshed.",
          );
          timer = window.setTimeout(() => void poll(), 4_000);
        }
      }
    }
    timer = window.setTimeout(() => void poll(), 1_000);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initialAudit.status, initialAudit.token]);

  return (
    <main
      className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 lg:px-10"
      id="main-content"
      tabIndex={-1}
    >
      <Link
        href="/audit"
        className="text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
      >
        ← Audit another website
      </Link>

      <section className="mt-7 rounded-3xl border border-white/10 bg-slate-900/65 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Limited public audit
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
              {audit.website.hostname}
            </h1>
            <a
              href={audit.website.url}
              target="_blank"
              rel="noreferrer"
              title={audit.website.url}
              aria-label={`Open ${audit.website.url} in a new tab`}
              className="mt-2 block max-w-xl break-all text-sm text-slate-400 hover:text-cyan-200 sm:truncate"
            >
              {audit.website.url} ↗
            </a>
          </div>
          <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-xs font-semibold text-cyan-200">
            {statusLabels[audit.status]}
          </span>
        </div>

        {!terminalStatuses.has(audit.status) ? (
          <div className="mt-9" aria-live="polite">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <span className="text-xs text-slate-400">Current stage</span>
                <strong className="mt-1 block text-sm text-slate-200">
                  {statusLabels[audit.currentStage]}
                </strong>
              </div>
              <b className="text-2xl text-white">{audit.progress}%</b>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-white/8"
              role="progressbar"
              aria-label="Free audit progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={audit.progress}
            >
              <span
                className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width] duration-500"
                style={{ width: `${audit.progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-400">{audit.message}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <span className="text-xs text-slate-400">Pages discovered</span>
                <strong className="mt-1 block text-xl text-white">
                  {audit.pagesDiscovered}
                </strong>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <span className="text-xs text-slate-400">Pages crawled</span>
                <strong className="mt-1 block text-xl text-white">
                  {audit.pagesCrawled} / 5 max
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {pollError ? (
          <p
            className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-sm text-amber-200"
            role="alert"
          >
            {pollError}
          </p>
        ) : null}
      </section>

      {complete ? (
        <>
          <section className="mt-8" aria-labelledby="free-score-heading">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Health snapshot
                </p>
                <h2
                  id="free-score-heading"
                  className="mt-2 text-2xl font-semibold text-white"
                >
                  Your free audit scores
                </h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-slate-400">
                Based on a limited sample of up to five pages. Unavailable
                engines are shown as N/A and are not estimated.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  "OVERALL",
                  "SEO",
                  "PERFORMANCE",
                  "ACCESSIBILITY",
                  "SECURITY",
                ] as const
              ).map((category) => (
                <PublicScore
                  key={category}
                  category={category}
                  score={scoreByCategory.get(category) ?? null}
                  featured={category === "OVERALL"}
                />
              ))}
            </div>
          </section>

          <section
            className="mt-10 rounded-3xl border border-white/10 bg-slate-900/65 p-6 sm:p-8"
            aria-labelledby="pdf-heading"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Your report
            </p>
            <h2
              className="mt-2 text-2xl font-semibold text-white"
              id="pdf-heading"
            >
              Download the audit PDF
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The PDF uses this completed audit’s real findings. An account is
              required, and each download counts against its report allowance.
            </p>
            <div className="mt-6">
              {currentPlan ? (
                <div className="flex flex-wrap items-center gap-4">
                  <PublicPdfDownload token={audit.token} />
                  <Link
                    className="text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                    href="/profile"
                  >
                    View my profile →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-200"
                    href={`/login?audit=${encodeURIComponent(audit.token)}`}
                  >
                    Sign in to download
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
                    href={`/register?audit=${encodeURIComponent(audit.token)}`}
                  >
                    Create free account
                  </Link>
                </div>
              )}
            </div>
            {currentPlan ? (
              <div className="mt-9 border-t border-white/10 pt-7">
                <h3 className="mb-2 text-lg font-semibold text-white">
                  Choose the right plan
                </h3>
                <p className="mb-5 text-sm text-slate-400">
                  INR prices are for one month of access. Sign in to choose a
                  paid plan through Razorpay when checkout is enabled. No
                  automatic renewal.
                </p>
                <PlanOptions currentPlan={currentPlan} />
              </div>
            ) : null}
          </section>

          <section className="mt-10" aria-labelledby="top-issues-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Highest priority
            </p>
            <h2
              id="top-issues-heading"
              className="mt-2 text-2xl font-semibold text-white"
            >
              Top issues from the free sample
            </h2>
            {audit.topIssues.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {audit.topIssues.map((issue) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
                    key={`${issue.category}-${issue.title}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[.65rem] font-bold tracking-wide ${
                          issue.severity === "CRITICAL"
                            ? "bg-rose-400/10 text-rose-300"
                            : issue.severity === "WARNING"
                              ? "bg-amber-300/10 text-amber-200"
                              : "bg-blue-400/10 text-blue-300"
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="text-xs font-semibold text-cyan-300">
                        {issue.category}
                      </span>
                      <span className="text-xs text-slate-400">
                        {issue.affectedPageCount} affected page
                        {issue.affectedPageCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-white">
                      {issue.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {issue.recommendation}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-5 text-sm text-emerald-200">
                No failing issues were recorded in the limited evaluated sample.
              </div>
            )}
          </section>

          <section className="mt-10 overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/10 via-slate-900 to-violet-400/10 p-6 sm:p-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Go beyond five pages
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Turn this snapshot into an improvement plan.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Create an account to download this report as a PDF and view your
                plan limits. For deeper help, request a website improvement
                service below.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {publicLeadServices.map((service, index) => (
                <button
                  type="button"
                  key={service}
                  onClick={() => setRequestedService(service)}
                  aria-expanded={requestedService === service}
                  aria-controls="public-lead-capture"
                  className={
                    index === 0
                      ? "rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
                      : "rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                  }
                >
                  {publicLeadServiceLabels[service]}
                </button>
              ))}
            </div>
            {requestedService ? (
              <div id="public-lead-capture">
                <PublicLeadForm
                  key={requestedService}
                  auditToken={audit.token}
                  requestedService={requestedService}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {audit.status === "FAILED" || audit.status === "CANCELLED" ? (
        <section className="mt-8 rounded-2xl border border-rose-300/15 bg-rose-300/5 p-6">
          <h2 className="text-lg font-semibold text-white">
            We could not finish this audit
          </h2>
          <p className="mt-2 text-sm text-slate-400">{audit.message}</p>
          <Link
            className="mt-5 inline-block rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950"
            href="/audit"
          >
            Try another website
          </Link>
        </section>
      ) : null}
    </main>
  );
}
