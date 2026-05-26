"use client";

import { useEffect, useRef } from "react";

import { mergeGuestCartAction } from "@/app/cart/actions";
import {
  clearGuestStorage,
  readGuestStorageLines,
  setServerCart,
} from "@/lib/cart/store";

/**
 * Post-OAuth cart-merge orchestrator. Renders nothing.
 *
 * Sits in the layout and listens for a single server-rendered
 * `pending` boolean — set when the auth callback dropped the
 * `__Host-zepr_cart_handoff` cookie. When the flag is on:
 *
 *   1. Read the guest `localStorage` cart (whatever the shopper
 *      built up before signing in).
 *   2. POST it through `mergeGuestCartAction`. Server policy:
 *      empty guest preserves the customer's existing Shopify
 *      cart; non-empty guest replaces it. See the action for
 *      the exact rules.
 *   3. On success, seed the client cart store with the merged
 *      Shopify cart so the badge + drawer reflect the new state
 *      without waiting for a navigation, and clear
 *      `localStorage` so the next logout doesn't resurrect the
 *      pre-login lines.
 *
 * The cookie itself is consumed by the server action — it
 * clears `__Host-zepr_cart_handoff` before doing any merge
 * work, so a refresh, a fast subsequent navigation, or a
 * Strict-Mode double-mount can't trip the handoff twice. The
 * `ranRef` here is the in-tab guard against the same render
 * cycle running the effect twice; the cookie is the
 * cross-render guard.
 *
 * No URL parameters, no `useSearchParams` — the post-login URL
 * stays visually identical to the deep link the shopper
 * started from.
 *
 * Failure handling: a merge that fails (network blip, Shopify
 * 5xx) leaves `localStorage` intact. The cookie is still
 * cleared so we don't infinite-loop — recovery is "next add
 * goes through `addToCartAction`, which lazy-creates a cart
 * with the customer's identity attached".
 */
export function CartLoginHandoff({ pending }: { pending: boolean }) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!pending || ranRef.current) return;
    ranRef.current = true;

    const lines = readGuestStorageLines();
    /* The merge action's payload is the minimal shape it needs
     * to resolve variant ids server-side — handle for the card-
     * level adds that never had a merchandiseId, plus the
     * merchandiseId for PDP-built lines that did. */
    const payload = lines.map((l) => ({
      merchandiseId: l.merchandiseId,
      handle: l.handle,
      quantity: l.quantity,
    }));

    /* IIFE so we can await inside an effect; the cleanup
     * function still returns void as React expects. */
    void (async () => {
      const result = await mergeGuestCartAction({ lines: payload });
      if (result.ok) {
        setServerCart(result.cart);
        clearGuestStorage();
      } else if (process.env.NODE_ENV === "development") {
        console.warn("[cart-handoff] merge failed:", result.error);
      }
    })();
  }, [pending]);

  return null;
}
