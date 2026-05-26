"use client";

import { useEffect, useState } from "react";

/**
 * `true` once this component has mounted on the client, `false`
 * through SSR and the first client render.
 *
 * Canonical use: gate the swap from "SSR-correct snapshot" to
 * "live client store" so the initial paint matches the server
 * HTML byte-for-byte and a `localStorage`-backed mutation can
 * take over from the second render on.
 *
 * # Why `useState + useEffect` and not `useSyncExternalStore`
 *
 * `useSyncExternalStore(no-op, () => true, () => false)` looks
 * like a more elegant fit for "boolean that flips after
 * hydration" — and it works for components on the document's
 * initial render path. It breaks for components that hydrate
 * inside a *streamed* Suspense sub-tree (Next.js's per-segment
 * `<LoadingBoundary>`, the App Router's `<PageBoundary>`,
 * `loading.tsx`, any `<Suspense>` you mount yourself…). When the
 * chunk lands, the outer app is already past its hydration
 * phase, so `useSyncExternalStore` switches straight to its
 * client snapshot during what's *supposed* to be the
 * matching-the-SSR-HTML render — the hook returns `true` on the
 * first render of the streamed sub-tree, the SSR-correct branch
 * is skipped, and the live-store branch paints against the
 * SSR-rendered HTML for the alternate branch. Hydration
 * mismatch.
 *
 * `useState(false) + useEffect(setMounted(true))` doesn't have
 * that failure mode. State initialisers run during render, so
 * the first render of *any* tree position (initial paint,
 * streamed Suspense chunk, lazy import, transition) sees
 * `false`. `useEffect` then fires strictly after every initial
 * render in the tree has committed — so by the time `mounted`
 * flips, any sibling render-time side effects (`<CartHydrator>`
 * seeding the cart store, `seedFavorites()` in the favorites
 * badge…) have already settled, and the live store is at its
 * authoritative value on the post-mount render.
 *
 * `react-hooks/set-state-in-effect` would prefer
 * `useSyncExternalStore` here — that's the hook we're
 * deliberately routing around, so the suppression lives at the
 * single source rather than getting copy-pasted into every call
 * site.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  return hydrated;
}
