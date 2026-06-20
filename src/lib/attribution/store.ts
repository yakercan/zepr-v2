"use client";

import { createStore } from "@/lib/external-store";
import type { Attribution } from "@/types/attribution";

/**
 * Client-side attribution snapshot.
 *
 * Hydrated once from the SSR'd cookie payload by
 * `<AttributionHydrator>` mounted in the layout. Consumers
 * (Buy Now button, guest checkout-permalink builder) subscribe
 * via `useAttribution()` and re-render only when the underlying
 * value changes by `Object.is` — same primitive-selector pattern
 * as the cart store, so an attribution capture mid-session won't
 * fan out renders to surfaces that don't care.
 *
 * No client-side capture path lives here intentionally. The
 * canonical capture point is the middleware (`src/middleware.ts`)
 * — it writes the cookie before the page renders, so the SSR'd
 * hydration prop is always current. Anything that wants to "set"
 * attribution should do it server-side and let the next render
 * cycle hydrate.
 */
const store = createStore<Attribution | null>(null, null);

/**
 * Authoritative hydration entry point. Called by
 * `<AttributionHydrator>` once per layout mount; idempotent
 * across re-renders. Safe to call with `null` — that's how
 * shoppers who arrived without any campaign land on the
 * page (and how we keep this store in sync if the cookie
 * expires mid-session).
 */
export function hydrateAttribution(attribution: Attribution | null): void {
  store.set(attribution);
}

/** Full attribution snapshot — re-renders the caller whenever
 *  the captured payload changes (rare). Returns `null` when the
 *  shopper arrived organically. */
export function useAttribution(): Attribution | null {
  return store.use();
}
