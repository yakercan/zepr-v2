"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * SSR-safe "are we on the client yet?" hook. Returns `false` on the
 * server and during the first client render (matching server output
 * so hydration doesn't mismatch), then `true` from the second render
 * onward. Idiomatic React 19 — no setState-in-effect, no flushSync
 * tricks.
 */
const subscribe = () => () => {};
const useIsClient = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/**
 * Reusable backdrop overlay.
 *
 * One component, two layers:
 *
 *   - **default** — sits *behind* the header (z-30 vs header's z-50)
 *     so the sticky bar stays crisp and readable while page content
 *     dims. Used by header dropdowns.
 *   - **`coverHeader`** — sits *above* the header (z-[60]). Used by
 *     modals / cart drawers / login sheets, where the header should
 *     fade with the rest of the page.
 *
 * Implementation notes:
 *
 *   - Portaled to `document.body` so it never inherits stacking or
 *     overflow constraints from whatever rendered it.
 *   - Kept mounted while open/closed and toggled via `opacity` +
 *     `pointer-events`. This lets the close transition actually play
 *     out instead of unmounting mid-fade, and avoids creating /
 *     destroying a DOM node on every open.
 *   - No `backdrop-filter` here — the header already runs a blur and
 *     stacking two blurs is expensive. Plain alpha is fast, GPU-only,
 *     and reads clean on any background.
 *   - `aria-hidden` because the overlay is purely decorative; focus
 *     and screen readers continue to interact with the open dropdown
 *     / modal beneath it.
 */
export interface BackdropProps {
  open: boolean;
  /** Render above the header (z > 50). Default behind (z < 50). */
  coverHeader?: boolean;
  /** Click handler. Dropdowns rely on the parent's outside-click
   *  listener, so this is optional; modals pass a close callback. */
  onClick?: () => void;
  /** Override the default tint. Tailwind classes welcome
   *  (e.g. `"bg-black/40"`, `"bg-white/60"`). */
  className?: string;
}

export function Backdrop({
  open,
  coverHeader = false,
  onClick,
  className,
}: BackdropProps) {
  const isClient = useIsClient();
  if (!isClient) return null;

  /* The backdrop lives in a portal but React's synthetic events
   * bubble through the *component* tree, not the DOM tree. Without
   * stopping here, a click on the backdrop bubbles into whatever
   * rendered the parent component — e.g. a modal that's nested
   * inside a `<Link>` would close the modal AND navigate the
   * underlying card. We stop both click and mousedown so the
   * backdrop acts as a true shielding overlay regardless of where
   * it's mounted in the React tree. */
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    onClick?.();
  }
  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return createPortal(
    <div
      aria-hidden
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={cn(
        "fixed inset-0 bg-black/20",
        "transition-opacity duration-150 ease-out",
        coverHeader ? "z-[60]" : "z-30",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
    />,
    document.body,
  );
}
