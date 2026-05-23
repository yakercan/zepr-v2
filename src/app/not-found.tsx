import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-ink-muted)]">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="max-w-md text-sm text-[color:var(--color-ink-secondary)]">
        The link may be broken or the page may have moved. Head back home and
        try again.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-[color:var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)]"
      >
        Back to home
      </Link>
    </section>
  );
}
