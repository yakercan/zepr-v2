"use client";

import { useState } from "react";

import { hydrateAttribution } from "@/lib/attribution/store";
import type { Attribution } from "@/types/attribution";

/**
 * Attribution hydrator. Renders nothing.
 *
 * Mounted once at the top of the layout. Mirrors the SSR'd
 * attribution snapshot (set by the middleware on the same
 * request it captured the UTMs on) into the client store so
 * client-side consumers — Buy Now button, guest checkout
 * permalink — read the same payload the server's cart-attribute
 * stamping uses.
 *
 * Why we react to the prop (not just lazy-init once):
 *
 *   - A shopper can click a fresh campaign link mid-session
 *     (e.g. starts on /home, opens an IG story, lands on a PDP
 *     with new UTMs). Middleware writes the new cookie, layout
 *     re-renders, this component receives a new `attribution`
 *     prop, and the store gets repointed.
 *   - We can't compare by object identity — `getAttribution()`
 *     deserialises a fresh object each request — so we key the
 *     comparison off `captured_at`, which is the only field
 *     guaranteed to change on a fresh capture.
 *
 * Pattern below is React's canonical "store info from previous
 * renders" recipe — calling `setState` during render is the
 * idiomatic way to react to prop changes without a `useEffect`,
 * and it lets the store update land in the same commit as the
 * page render (so subscribers paint the right value on the
 * first frame after a fresh capture).
 */
export function AttributionHydrator({
  attribution,
}: {
  attribution: Attribution | null;
}) {
  /* `undefined` = "not yet seen", distinct from a `null` first
   * capture so the initial mount always triggers a hydration
   * call (even when the shopper arrived organically — we want
   * the store explicitly set to `null` rather than left at its
   * stale prior value from an earlier navigation). */
  const [lastKey, setLastKey] = useState<string | null | undefined>(undefined);
  const key = attribution?.captured_at ?? null;

  if (lastKey !== key) {
    setLastKey(key);
    hydrateAttribution(attribution);
  }

  return null;
}
