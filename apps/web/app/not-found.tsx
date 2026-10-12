import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center gap-4 px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
        404
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">
        Page not found
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        The link may be outdated, or the resource is no longer available to your
        workspace.
      </p>
      <Link
        className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        href="/"
      >
        Return home
      </Link>
    </main>
  );
}
