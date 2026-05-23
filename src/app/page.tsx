/**
 * Home route placeholder. Real homepage content (banner slider,
 * product feeds, etc.) will land here in a later step — for now this
 * is just a marker so the route compiles and the dev server boots.
 */
export default function HomePage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-screen-md flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Zepr v2</h1>
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        Foundations are in place. Pages and components are next.
      </p>
    </section>
  );
}
