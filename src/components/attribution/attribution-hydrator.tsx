"use client";

import { useEffect, useRef } from "react";

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
 * Why the dispatch lives in `useEffect`, not render:
 *
 *   - `hydrateAttribution` calls `set()` on an external store,
 *     which synchronously fans out to every subscriber (cart
 *     footer's checkout URL, Buy Now action, etc.). Calling that
 *     during this component's render schedules `setState` on
 *     *other* components mid-render, which React 19 flags as
 *     "Cannot update a component while rendering a different
 *     component". The canonical "store info from previous renders"
 *     pattern is only safe for `setState` on the *same* component
 *     — for external store updates that cascade, we have to wait
 *     until after commit.
 *   - One frame's delay is fine here: attribution is consumed on
 *     user clicks (Buy Now) and on checkout-URL builds. By the
 *     time the page is interactive, this effect has flushed.
 *
 * `lastKeyRef` carries the most recent `captured_at` we've
 * already dispatched for, so a parent re-render with the same
 * attribution doesn't refire the store (which would be a no-op
 * thanks to `Object.is` on identical refs, but `getAttribution`
 * hands back a fresh object each request — that wouldn't be
 * identity-equal). Keying on `captured_at` is the cheapest
 * stable invariant.
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
  const lastKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const key = attribution?.captured_at ?? null;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    hydrateAttribution(attribution);
  }, [attribution]);

  return null;
}
