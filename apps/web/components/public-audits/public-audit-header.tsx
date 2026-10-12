import Link from "next/link";

export function PublicAuditHeader() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
      <Link
        className="group flex items-center gap-3 text-white"
        href="/"
        aria-label="SiteSignal home"
      >
        <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
          <svg
            aria-hidden="true"
            className="size-5 text-cyan-300"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M4 17V7m5 10v-4m5 4V9m5 8V4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="text-base font-semibold tracking-tight">
          SiteSignal
        </span>
      </Link>

      <nav className="flex items-center gap-2" aria-label="Public navigation">
        <Link
          className="hidden min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white sm:flex"
          href="/login"
        >
          Sign in
        </Link>
        <Link
          className="inline-flex min-h-11 items-center rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
          href="/register?source=public-audit"
        >
          Create account
        </Link>
      </nav>
    </header>
  );
}
