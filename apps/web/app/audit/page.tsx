import { PublicAuditForm } from "../../components/public-audits/public-audit-form";
import { PublicAuditHeader } from "../../components/public-audits/public-audit-header";
import { createMarketingMetadata } from "../../lib/seo/marketing-metadata";

export const metadata = createMarketingMetadata({
  title: "Free website audit",
  description:
    "Run a free five-page website audit for SEO, performance, accessibility, and security signals.",
  path: "/audit",
});

const coverage = [
  ["SEO", "Titles, indexability, metadata, headings, and links"],
  ["Performance", "Real PageSpeed data when Google returns it"],
  ["Accessibility", "A bounded browser analysis with axe-core"],
  ["Security", "Passive HTTPS and response-header observations"],
] as const;

export default function PublicAuditPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div aria-hidden="true" className="page-glow" />
      <div className="relative">
        <PublicAuditHeader />
        <main
          className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pb-28 lg:pt-20"
          id="main-content"
          tabIndex={-1}
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              <span className="size-1.5 rounded-full bg-emerald-300" />
              Free · No account required · Up to 5 pages
            </div>
            <h1 className="mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1.03] tracking-[-0.05em] sm:text-6xl">
              Find what is holding your website back.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-300">
              Whether you run a local business, an online store, or an agency,
              get a real website health snapshot across search, performance,
              accessibility, and passive security—without creating an account.
            </p>
            <PublicAuditForm />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
              <span>Public HTTP/HTTPS websites only</span>
              <span>robots.txt respected</span>
              <span>No penetration testing</span>
            </div>
          </div>

          <aside className="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div
              aria-hidden="true"
              className="absolute -inset-8 rounded-[2.5rem] bg-cyan-400/5 blur-3xl"
            />
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
              <div className="flex items-start justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Included in your snapshot
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    Useful signals. Honest limits.
                  </h2>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 text-xs font-bold text-cyan-200">
                  5 pages
                </span>
              </div>
              <div className="mt-5 grid gap-3">
                {coverage.map(([label, description], index) => (
                  <article
                    key={label}
                    className="rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-7 place-items-center rounded-lg bg-cyan-300/8 font-mono text-[.65rem] text-cyan-300">
                        0{index + 1}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {label}
                      </h3>
                    </div>
                    <p className="mt-2 pl-10 text-xs leading-5 text-slate-400">
                      {description}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-400">
                See your score here without an account. Sign in to download the
                completed audit as a PDF, subject to your report allowance.
              </p>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
