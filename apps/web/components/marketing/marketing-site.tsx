import Link from "next/link";
import { formatPlanMonthlyPrice, PlanTier } from "@website-audit/shared";
import { PlanOptions } from "../plans/plan-options";
import type { ReactNode } from "react";

import { SiteLogoMark } from "../brand/site-logo";
import { PublicAuditForm } from "../public-audits/public-audit-form";

type IconName =
  | "search"
  | "bolt"
  | "accessibility"
  | "shield"
  | "code"
  | "chart"
  | "document"
  | "clock";
type MarketingPage = {
  title: string;
  description: string;
  eyebrow: string;
  sections: readonly { title: string; copy: string }[];
};
type FeaturePage = MarketingPage & {
  icon: IconName;
  checks: readonly string[];
};

const featurePages = {
  "seo-audit": {
    eyebrow: "SEO audit",
    title: "Make every important page easier to understand and discover.",
    description:
      "Review the on-page signals that affect how search engines and visitors interpret your website.",
    icon: "search",
    checks: [
      "Titles, descriptions, canonical URLs, and robots directives",
      "Heading structure, language declarations, and structured data",
      "Internal links, image alternatives, and duplicate metadata",
    ],
    sections: [
      {
        title: "Evidence, not assumptions",
        copy: "Each finding retains the page, rule, and observed evidence so the next action is easy to verify.",
      },
      {
        title: "Focused fixes",
        copy: "Prioritize problems by severity, affected coverage, and score impact instead of working through an unranked checklist.",
      },
    ],
  },
  performance: {
    eyebrow: "Performance audit",
    title: "See which delivery signals slow down your website experience.",
    description:
      "Combine stored crawl observations with available PageSpeed Insights data for a clearer performance picture.",
    icon: "bolt",
    checks: [
      "Performance score and Core Web Vitals when PageSpeed data is available",
      "LCP, CLS, INP, FCP, TTFB, Speed Index, and Total Blocking Time",
      "Large resources, caching opportunities, and render-blocking signals",
    ],
    sections: [
      {
        title: "Honest availability",
        copy: "When a third-party performance result is unavailable, the audit marks it unavailable instead of inventing a score.",
      },
      {
        title: "A better performance conversation",
        copy: "Keep the metric, the evidence, and the recommended next step together in one report.",
      },
    ],
  },
  accessibility: {
    eyebrow: "Accessibility audit",
    title:
      "Find barriers that prevent people from using your website confidently.",
    description:
      "Run bounded browser-based checks only where they add useful evidence, while keeping audits practical.",
    icon: "accessibility",
    checks: [
      "Image alternatives, labels, button names, and link names",
      "Language, heading structure, iframe titles, duplicate IDs, and ARIA observations",
      "Reliable axe-core observations, including contrast where supported",
    ],
    sections: [
      {
        title: "Actionable context",
        copy: "Accessibility findings include the affected location and evidence needed to review the problem with confidence.",
      },
      {
        title: "Responsible scope",
        copy: "The system does not claim subjective or unsupported issues; unavailable checks remain clearly marked.",
      },
    ],
  },
  security: {
    eyebrow: "Security audit",
    title: "Understand the passive security signals your website exposes.",
    description:
      "Review transport and response-header configuration without probing, exploiting, or attempting to break your site.",
    icon: "shield",
    checks: [
      "HTTPS behavior, HTTP-to-HTTPS redirects, and observable TLS availability",
      "HSTS, CSP, X-Content-Type-Options, X-Frame-Options, and policy headers",
      "Mixed content, server disclosure, and observable cookie attributes",
    ],
    sections: [
      {
        title: "Passive by design",
        copy: "Security analysis checks publicly observable configuration only. It is not penetration testing.",
      },
      {
        title: "Clear confidence levels",
        copy: "Reports separate confirmed missing headers, observed configuration, and conditions that cannot be determined.",
      },
    ],
  },
} as const satisfies Record<string, FeaturePage>;
export type FeatureSlug = keyof typeof featurePages;

export const marketingPages = {
  agencies: {
    eyebrow: "For agencies",
    title: "Give every client a clear, evidence-based website health plan.",
    description:
      "Keep client websites, audits, reports, and follow-up work organized in a workspace built for repeatable delivery.",
    sections: [
      {
        title: "Client-ready reporting",
        copy: "Turn completed audit evidence into a professional PDF report and a prioritized action plan.",
      },
      {
        title: "A single operational view",
        copy: "Associate websites with clients, revisit audit history, and compare progress over time.",
      },
      {
        title: "Built for responsible scale",
        copy: "Audit limits and workspace access are enforced server-side, so client work remains controlled as your team grows.",
      },
    ],
  },
  pricing: {
    eyebrow: "Plans",
    title:
      "Start with a useful audit. Grow into continuous website intelligence.",
    description:
      "Choose a workspace plan based on the websites, crawl depth, reporting, and collaboration your work requires.",
    sections: [
      {
        title: "Free",
        copy: "A focused starting point for one website, a small crawl limit, and a limited number of monthly audits.",
      },
      {
        title: "Pro",
        copy: "Built for ongoing optimization with deeper crawls, audit history, comparisons, schedules, and full reports.",
      },
      {
        title: "Agency",
        copy: "For client work that needs larger limits, teams, client management, white labeling, and priority handling.",
      },
    ],
  },
  about: {
    eyebrow: "About",
    title: "Website intelligence should be clear enough to act on.",
    description:
      "SiteSignal brings technical website signals into one professional, evidence-based workflow.",
    sections: [
      {
        title: "One source of truth",
        copy: "SEO, technical SEO, performance, accessibility, security, and mobile observations belong in one audit story.",
      },
      {
        title: "Useful by design",
        copy: "The product favors deterministic checks, stored evidence, clear availability states, and recommendations that can be verified.",
      },
    ],
  },
  contact: {
    eyebrow: "Get started",
    title: "Start with your website, then build the workflow you need.",
    description:
      "Run a limited public audit without an account, or create a workspace for full reports, history, and collaboration.",
    sections: [
      {
        title: "Try the free audit",
        copy: "Use a public website URL to receive a limited evidence-based health snapshot of up to five pages.",
      },
      {
        title: "Create a workspace",
        copy: "A workspace unlocks website management, recurring audit history, detailed findings, and report workflows.",
      },
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy information for SiteSignal visitors and workspace users.",
    description:
      "This page explains the high-level data handling used by the product. It is not legal advice.",
    sections: [
      {
        title: "Website audit data",
        copy: "Audits store the URL, crawl observations, extracted metadata, metrics, and findings needed to present the audit report.",
      },
      {
        title: "Account and workspace data",
        copy: "Account and workspace records support authentication, authorization, audit ownership, subscriptions, and product operations.",
      },
      {
        title: "Security and access",
        copy: "The product applies server-side workspace authorization and validates user-supplied website URLs before crawling.",
      },
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "Terms for using the SiteSignal service.",
    description:
      "These product terms are a high-level service summary and should be reviewed with appropriate legal guidance before production launch.",
    sections: [
      {
        title: "Authorized use",
        copy: "Submit websites you are authorized to assess. The product performs passive, bounded website analysis and is not a penetration-testing service.",
      },
      {
        title: "Service availability",
        copy: "Some engines depend on third-party services or browser analysis. Unavailable optional results are marked as unavailable rather than represented as completed.",
      },
      {
        title: "Your responsibility",
        copy: "You remain responsible for decisions and changes made using audit results. Verify recommendations within your own website and business context.",
      },
    ],
  },
} as const satisfies Record<string, MarketingPage>;
export type MarketingPageSlug = keyof typeof marketingPages;
export function isFeatureSlug(value: string): value is FeatureSlug {
  return Object.hasOwn(featurePages, value);
}
export function isMarketingPageSlug(value: string): value is MarketingPageSlug {
  return Object.hasOwn(marketingPages, value);
}

function SignalIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    search: "m20 20-4.2-4.2m1.2-4.8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
    bolt: "m13 2-9 12h7l-1 8 9-12h-7l1-8Z",
    accessibility: "M12 3v18m-6-15h12m-11 4 5 4 5-4m-8 11 3-7 3 7",
    shield:
      "M12 3 4.5 6v5.6c0 4.5 3.1 7.5 7.5 9.4 4.4-1.9 7.5-4.9 7.5-9.4V6L12 3Zm-3 9 2 2 4-4",
    code: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12",
    chart: "M4 19V5m0 14h16M8 15l3-3 3 2 5-6",
    document: "M6 3h8l4 4v14H6V3Zm8 0v5h5M9 12h6m-6 4h6",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v4l3 2",
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function MarketingHeader() {
  return (
    <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-5 sm:px-8 lg:px-10">
      <Link
        className="flex items-center gap-2.5 text-white"
        href="/"
        aria-label="SiteSignal home"
      >
        <span className="grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
          <SiteLogoMark className="size-5" />
        </span>
        <span className="text-[0.9rem] font-semibold tracking-tight sm:text-[0.95rem]">
          SiteSignal
        </span>
      </Link>
      <nav
        className="hidden items-center gap-1 lg:flex"
        aria-label="Primary navigation"
      >
        <Link
          className="inline-flex min-h-11 items-center px-3 py-2 text-sm text-slate-300 transition hover:text-white"
          href="/features"
        >
          Features
        </Link>
        <Link
          className="inline-flex min-h-11 items-center px-3 py-2 text-sm text-slate-300 transition hover:text-white"
          href="/agencies"
        >
          Agencies
        </Link>
        <Link
          className="inline-flex min-h-11 items-center px-3 py-2 text-sm text-slate-300 transition hover:text-white"
          href="/pricing"
        >
          Pricing
        </Link>
      </nav>
      <details className="group relative ml-auto lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5">
          <span className="sr-only">Open navigation menu</span>
          <span aria-hidden="true">Menu</span>
        </summary>
        <nav
          aria-label="Mobile primary navigation"
          className="absolute right-0 z-20 mt-2 grid min-w-44 gap-1 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-2xl shadow-black/35"
        >
          <Link
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            href="/features"
          >
            Features
          </Link>
          <Link
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            href="/agencies"
          >
            Agencies
          </Link>
          <Link
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            href="/pricing"
          >
            Pricing
          </Link>
          <Link
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            href="/login"
          >
            Sign in
          </Link>
        </nav>
      </details>
      <div className="flex items-center gap-2">
        <Link
          className="hidden min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white sm:inline-flex"
          href="/login"
        >
          Sign in
        </Link>
        <Link
          className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 sm:px-4"
          href="/audit"
        >
          <span className="sm:hidden">Free audit</span>
          <span className="hidden sm:inline">Run free audit</span>
        </Link>
      </div>
    </header>
  );
}
function MarketingFooter() {
  const groups = [
    {
      label: "Product",
      links: [
        ["Features", "/features"],
        ["Free audit", "/audit"],
        ["Pricing", "/pricing"],
      ],
    },
    {
      label: "Solutions",
      links: [
        ["SEO audit", "/features/seo-audit"],
        ["Performance", "/features/performance"],
        ["Accessibility", "/features/accessibility"],
        ["Security", "/features/security"],
      ],
    },
    {
      label: "Company",
      links: [
        ["Agencies", "/agencies"],
        ["About", "/about"],
        ["Get started", "/contact"],
      ],
    },
    {
      label: "Legal",
      links: [
        ["Privacy", "/privacy"],
        ["Terms", "/terms"],
      ],
    },
  ] as const;
  return (
    <footer className="border-t border-white/10 bg-slate-950">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:px-10">
        <div className="max-w-xs">
          <p className="text-base font-semibold text-white">SiteSignal</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Website intelligence for ambitious Indian businesses and agencies.
          </p>
        </div>
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </p>
            <ul className="mt-4 grid gap-2.5 text-sm text-slate-400">
              {group.links.map(([label, href]) => (
                <li key={href}>
                  <Link
                    className="inline-flex min-h-11 items-center transition hover:text-cyan-200"
                    href={href}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 border-t border-white/10 px-5 py-5 text-xs text-slate-400 sm:flex-row sm:justify-between sm:px-8 lg:px-10">
        <span>© {new Date().getFullYear()} SiteSignal</span>
        <span>Built for India. Evidence first, always.</span>
      </div>
    </footer>
  );
}
function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="page-glow" aria-hidden="true" />
      <div className="relative">
        <MarketingHeader />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </div>
  );
}
const categories: readonly {
  title: string;
  copy: string;
  icon: IconName;
  href: string;
}[] = [
  {
    title: "SEO",
    copy: "Metadata, headings, canonicals, indexability, schema, images, and internal links.",
    icon: "search",
    href: "/features/seo-audit",
  },
  {
    title: "Technical",
    copy: "Response behavior, crawlability, redirects, robots, sitemaps, and page weight.",
    icon: "code",
    href: "/features",
  },
  {
    title: "Performance",
    copy: "Core Web Vitals and optimization opportunities when metrics are available.",
    icon: "bolt",
    href: "/features/performance",
  },
  {
    title: "Accessibility",
    copy: "Evidence-backed checks for content, controls, labels, semantics, and ARIA.",
    icon: "accessibility",
    href: "/features/accessibility",
  },
  {
    title: "Security",
    copy: "Passive transport, header, mixed-content, and observable disclosure checks.",
    icon: "shield",
    href: "/features/security",
  },
];
function Heading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-200">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
        {title}
      </h2>
      {copy ? (
        <p className="mt-4 text-pretty text-base leading-7 text-slate-400">
          {copy}
        </p>
      ) : null}
    </div>
  );
}
function PreviewCard() {
  const signals = ["SEO", "Performance", "Accessibility", "Security"];
  return (
    <div className="relative mx-auto w-full max-w-xl rounded-[2rem] border border-white/15 bg-slate-900/90 p-5 shadow-[0_35px_100px_rgba(0,0,0,.38)] sm:p-7">
      <div className="absolute -right-3 -top-3 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-[.68rem] font-bold uppercase tracking-[0.12em] text-amber-100 sm:right-5 sm:-top-4">
        Your audit, explained
      </div>
      <div className="flex items-start justify-between border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">
            SiteSignal / Audit overview
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            Clarity for every next step
          </p>
        </div>
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"
        >
          <SignalIcon name="chart" />
        </span>
      </div>
      <div className="mt-5 flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-950/70 p-5 sm:flex-row sm:items-center">
        <div className="grid size-28 shrink-0 place-items-center rounded-full border-[9px] border-cyan-300/25 text-center text-sm font-semibold leading-5 text-cyan-100">
          Real
          <br />
          score
        </div>
        <div>
          <p className="text-base font-semibold text-white">
            A health score backed by checks
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            No random numbers. Your score appears only after the website has
            been analysed.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {signals.map((signal) => (
          <div
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4"
            key={signal}
          >
            <p className="text-sm font-semibold text-slate-100">{signal}</p>
            <p className="mt-1 text-xs text-slate-300">Evidence-led review</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
          Clear action plan
        </p>
        <p className="mt-1.5 text-sm font-medium text-slate-200">
          See each finding, its evidence, and what to fix first.
        </p>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-300">
        Product preview only. Live results are generated from your submitted
        website.
      </p>
    </div>
  );
}

export function MarketingHome() {
  return (
    <MarketingLayout>
      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.06fr_.94fr] lg:px-10 lg:pb-28 lg:pt-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-12 -z-10 size-72 rounded-full bg-amber-300/[0.08] blur-3xl"
        />
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold tracking-wide text-amber-100">
            <span className="size-1.5 rounded-full bg-amber-300" />
            Made for websites growing in India
          </div>
          <h1 className="mt-7 max-w-3xl text-balance text-[clamp(2.8rem,7vw,5rem)] font-semibold leading-[1.02] tracking-[-0.06em]">
            A healthier website starts with{" "}
            <span className="text-cyan-200">knowing what to fix.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-300">
            Get a real SEO, performance, accessibility, security and technical
            audit of your site. Understand the issues. Prioritise the work.
          </p>
          <PublicAuditForm />
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-300">
            <span>Public HTTP/HTTPS websites only</span>
            <span>Up to 5 pages free</span>
            <span>No account needed to see a score</span>
          </div>
        </div>
        <PreviewCard />
      </section>
      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-14 sm:grid-cols-3 sm:px-8 lg:px-10">
          {[
            [
              "One website health score",
              "A deterministic summary based on evaluated audit categories.",
            ],
            [
              "Issues with recommendations",
              "See what was observed, why it matters, and what to review next.",
            ],
            [
              "Built for follow-through",
              "Track findings, audit history, comparisons, and report workflows in one workspace.",
            ],
          ].map(([title, copy]) => (
            <div key={title}>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <Heading
          eyebrow="Audit coverage"
          title="A complete audit story, not a disconnected checklist."
          copy="Explore the signals that affect discoverability, usability, speed, and trust."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link
              className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
              href={category.href}
              key={category.title}
            >
              <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
                <SignalIcon name={category.icon} />
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">
                {category.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {category.copy}
              </p>
              <span className="mt-5 inline-block text-sm font-semibold text-cyan-200">
                Explore {category.title} →
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="border-y border-white/10 bg-slate-900/55">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <Heading
              eyebrow="How it works"
              title="From a URL to an ordered action plan."
            />
            <ol className="mt-8 grid gap-6">
              {[
                [
                  "01",
                  "Add a website",
                  "Start with a public URL or add a website to your workspace.",
                ],
                [
                  "02",
                  "Run a bounded audit",
                  "The worker validates, crawls, analyzes, and stores supported evidence.",
                ],
                [
                  "03",
                  "Prioritize what matters",
                  "Use scores, issue severity, coverage, and recommendations to plan next steps.",
                ],
              ].map(([number, title, copy]) => (
                <li className="flex gap-4" key={number}>
                  <span className="font-mono text-xs text-cyan-300">
                    {number}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-400">
                      {copy}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              A score you can explain
            </p>
            <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
              <div className="grid size-28 shrink-0 place-items-center rounded-full border-[10px] border-cyan-300/30 text-center text-sm font-semibold text-cyan-100">
                Your
                <br />
                score
              </div>
              <div>
                <p className="text-lg font-semibold">Website health score</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Category scores and overall health appear after a completed
                  audit, calculated from stored findings rather than sample
                  data.
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-200">
                  Critical
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Resolve high-impact risks first.
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
                  Recommendations
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Plan improvements with context.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: "document",
              title: "Client-ready PDF reports",
              copy: "Generate a polished audit summary with category scores, priority actions, and clear findings.",
            },
            {
              icon: "clock",
              title: "Scheduled monitoring",
              copy: "Build a routine around repeatable audits and compare stored results over time.",
            },
            {
              icon: "chart",
              title: "Agency workflow",
              copy: "Associate client websites, revisit evidence, and keep website health conversations organized.",
            },
          ].map((item) => (
            <article
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
              key={item.title}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-cyan-200">
                <SignalIcon name={item.icon as IconName} />
              </span>
              <h3 className="mt-5 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {item.copy}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <Heading
            eyebrow="Pricing preview"
            title="Choose the depth and workflow that matches your work."
          />
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {(
              [
                [
                  "Free",
                  PlanTier.FREE,
                  "Start with one website and limited, focused audits.",
                  "Run free audit",
                  "/audit",
                ],
                [
                  "Pro",
                  PlanTier.PRO,
                  "Go deeper with audit history, comparisons, schedules, and full reports.",
                  "Create workspace",
                  "/register",
                ],
                [
                  "Agency",
                  PlanTier.AGENCY,
                  "Organize client websites with team, reporting, and larger-scale workflows.",
                  "Explore agency workflows",
                  "/agencies",
                ],
              ] as const
            ).map(([name, tier, copy, cta, href]) => (
              <article
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-6"
                key={name}
              >
                <h3 className="text-lg font-semibold">{name}</h3>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-white">
                  {formatPlanMonthlyPrice(tier)}{" "}
                  <span className="text-sm font-normal text-slate-300">
                    / month
                  </span>
                </p>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
                  {copy}
                </p>
                <Link
                  className="mt-6 inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
                  href={href}
                >
                  {cta}
                </Link>
              </article>
            ))}
          </div>
          <Link
            className="mt-6 inline-block text-sm font-semibold text-cyan-200"
            href="/pricing"
          >
            View plan details →
          </Link>
          <p className="mt-3 text-xs leading-5 text-slate-300">
            INR pricing for one month of access. Secure Razorpay checkout is
            available after sign-in when enabled; payments do not renew
            automatically.
          </p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-8">
        <Heading eyebrow="FAQ" title="Questions, answered plainly." />
        <div className="mt-9 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.025]">
          {[
            [
              "Is the public audit really free?",
              "Yes. The public audit is intentionally limited to a small crawl of up to five pages and does not require an account.",
            ],
            [
              "Does SiteSignal perform penetration testing?",
              "No. Security checks are passive and limited to publicly observable transport and response configuration.",
            ],
            [
              "What happens when a metric cannot be collected?",
              "The report marks it unavailable. The product does not create a score or issue without supporting data.",
            ],
            [
              "Can I track changes over time?",
              "Workspace audits retain history and score comparisons for completed audits of the same website.",
            ],
            [
              "Can I pay for a plan online?",
              "Yes, when checkout is enabled. Sign in to purchase one month of paid access securely through Razorpay. It does not renew automatically.",
            ],
          ].map(([question, answer]) => (
            <details className="group p-5" key={question}>
              <summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-white">
                {question}
                <span className="float-right text-cyan-200 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-400">{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:px-10">
        <div className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/[0.12] to-violet-300/[0.08] px-6 py-12 text-center sm:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-100">
            Start with the signals that matter
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Get a clear view of what&apos;s holding your website back.
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
              href="/audit"
            >
              Run free audit
            </Link>
            <Link
              className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              href="/register"
            >
              Create workspace
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
export function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-7xl px-5 pb-20 pt-16 sm:px-8 lg:px-10 lg:pt-24">
        <Heading
          eyebrow="Features"
          title="A disciplined website audit workflow from first crawl to next action."
          copy="SiteSignal joins broad audit coverage with clear evidence, deterministic scoring, and practical follow-through."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {categories.map((category) => (
            <Link
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
              href={category.href}
              key={category.title}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-300/[0.08] text-cyan-200">
                <SignalIcon name={category.icon} />
              </span>
              <h2 className="mt-5 text-lg font-semibold">{category.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {category.copy}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
export function FeatureDetailPage({ feature }: { feature: FeaturePage }) {
  return (
    <MarketingLayout>
      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:px-10 lg:pt-24">
        <div>
          <span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
            <SignalIcon name={feature.icon} />
          </span>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.15em] text-cyan-200">
            {feature.eyebrow}
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            {feature.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            {feature.description}
          </p>
          <Link
            className="mt-8 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
            href="/audit"
          >
            Run free audit
          </Link>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            What this audit can review
          </p>
          <ul className="mt-6 grid gap-5">
            {feature.checks.map((check) => (
              <li
                className="flex gap-3 text-sm leading-6 text-slate-300"
                key={check}
              >
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-200">
                  ✓
                </span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="border-t border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-16 sm:px-8 md:grid-cols-2 lg:px-10">
          {feature.sections.map((section) => (
            <article
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-6"
              key={section.title}
            >
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {section.copy}
              </p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
export function MarketingInfoPage({ page }: { page: MarketingPage }) {
  const pricing = page.eyebrow === "Plans";
  const contact = page.eyebrow === "Get started";
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-7xl px-5 pb-20 pt-16 sm:px-8 lg:px-10 lg:pt-24">
        <Heading
          eyebrow={page.eyebrow}
          title={page.title}
          copy={page.description}
        />
        {pricing ? (
          <div className="mt-12">
            <PlanOptions />
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center rounded-lg bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
                href="/audit"
              >
                Run a free audit
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
                href="/register"
              >
                Create an account
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-400">
              Prices are in Indian rupees for one month of access. Sign in to
              use Razorpay checkout when enabled. No automatic renewal.
            </p>
          </div>
        ) : (
          <div
            className={`mt-12 grid gap-4 ${page.sections.length > 2 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}
          >
            {page.sections.map((section) => (
              <article
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                key={section.title}
              >
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {section.copy}
                </p>
                {pricing ? (
                  <Link
                    className="mt-6 inline-flex text-sm font-semibold text-cyan-200"
                    href={section.title === "Free" ? "/audit" : "/register"}
                  >
                    {section.title === "Free"
                      ? "Run free audit"
                      : "Create workspace"}{" "}
                    →
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {contact ? (
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
              href="/audit"
            >
              Run free audit
            </Link>
            <Link
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
              href="/register"
            >
              Create workspace
            </Link>
          </div>
        ) : null}
      </section>
    </MarketingLayout>
  );
}
export function getFeaturePage(slug: FeatureSlug): FeaturePage {
  return featurePages[slug];
}
export function getMarketingPage(slug: MarketingPageSlug): MarketingPage {
  return marketingPages[slug];
}
