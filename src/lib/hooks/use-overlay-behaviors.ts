"use client";

import { useEffect } from "react";

/**
 * Overlay primitives — the small useEffects that every floating
 * surface (drawer, modal, popover, sheet) needs in one place. Each
 * hook is a single concern; compose them at the call site.
 *
 * Extracted because (a) cart drawer and modal both want all three,
 * (b) future overlays will want the same, and (c) the original
 * inline versions had subtly different behaviours (Escape listener
 * attached at `window` vs `document`, scroll restore vs blanket
 * clear) — pinning them to one implementation each removes that
 * drift.
 */

/**
 * Lock body scroll while `active`. The previous `body.style.overflow`
 * value is captured on entry so closing restores it — friendlier to
 * any other code that might have set its own lock.
 *
 * Pairs cleanly with `useEscapeClose`: open the overlay → set
 * `active=true` → body locked + Escape wired → close flips both.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/**
 * Close the overlay when the user presses Escape. Listener is only
 * attached while `active` is true, so closed overlays don't intercept
 * keyboard events meant for anything else (search bar, dropdowns,
 * form controls).
 *
 * Document-level so it catches the key even when focus is parked
 * inside the overlay's own content (e.g. a form field).
 */
export function useEscapeClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}
