"use client";

import { useSyncExternalStore } from "react";

/**
 * Device hooks — two orthogonal signals, deliberately kept separate.
 *
 * There is no provider, no cookie, and no server-side user-agent read.
 * Structural layout is handled by viewport media queries in the markup
 * (standard Tailwind breakpoints); these hooks exist only for the
 * places that must branch a React *component* rather than just CSS.
 *
 *   • `useIsCompact()` — **viewport** gate. `true` below Tailwind's
 *     `xl` (1280px), i.e. exactly when the mobile header is showing.
 *     Use it to pick the *structure* of an overlay: a Vaul bottom/side
 *     **sheet** vs a centered **modal** / hover **dropdown**. This is
 *     what makes drawers work on a small desktop window — the choice
 *     follows the layout, not the input device.
 *
 *   • `useIsTouch()` — **input** gate. `true` when the primary input
 *     is a finger (`(hover: none) and (pointer: coarse)`). Use it for
 *     genuinely input-dependent *behavior*: swipe vs hover gallery
 *     navigation, hover-intent dropdowns, tap-vs-hover tooltips. It
 *     shares its signal with the `touch:` / `desktop:` Tailwind
 *     variants, and correctly classifies iPads (which report a desktop
 *     UA but answer `pointer: coarse` honestly).
 *
 * Both render the "false" branch on the server and swap to the live
 * value on the client via `useSyncExternalStore` — no hydration
 * warning. Nothing that branches on them is visible on first paint
 * (overlays are closed, gesture handlers attach post-hydration), so
 * there is no flash.
 */

/** A media-query store with a single, lazily-created `MediaQueryList`
 *  and stable subscribe / snapshot callbacks, so `useSyncExternalStore`
 *  never needlessly re-subscribes and every consumer shares one
 *  browser listener. */
function mediaQueryStore(query: string) {
  let mql: MediaQueryList | null = null;
  const resolve = (): MediaQueryList | null => {
    if (
      mql === null &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      mql = window.matchMedia(query);
    }
    return mql;
  };
  return {
    subscribe(onChange: () => void): () => void {
      const m = resolve();
      if (!m) return () => {};
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    getSnapshot(): boolean {
      return resolve()?.matches ?? false;
    },
    getServerSnapshot(): boolean {
      return false;
    },
  };
}

/* Compact ⇔ "mobile layout": a narrow viewport OR any non-desktop
 * pointer. The exact logical complement of the `*-desktop` CSS
 * variants (`min-width: 1280px AND hover: hover AND pointer: fine`),
 * so a touch device — an iPad in landscape included — is "compact" at
 * any width and gets Vaul sheets, matching its CSS layout. `1279.98px`
 * lands on Tailwind's `max-xl` boundary. */
const compactStore = mediaQueryStore(
  "(max-width: 1279.98px), (hover: none), (pointer: coarse)",
);
const touchStore = mediaQueryStore("(hover: none) and (pointer: coarse)");

/** `true` in the compact / "mobile layout" mode — a narrow viewport or
 *  a touch device of any width — where the mobile header is shown and
 *  overlays render as Vaul sheets. Structural gate. */
export function useIsCompact(): boolean {
  return useSyncExternalStore(
    compactStore.subscribe,
    compactStore.getSnapshot,
    compactStore.getServerSnapshot,
  );
}

/** `true` when the primary input is a finger (no hover, coarse
 *  pointer) — phones and tablets, including iPads. Behavior gate. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    touchStore.subscribe,
    touchStore.getSnapshot,
    touchStore.getServerSnapshot,
  );
}
