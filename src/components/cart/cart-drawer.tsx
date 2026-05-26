"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Backdrop } from "@/components/ui/backdrop";
import { CloseIcon } from "@/components/ui/icons";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { CartEmpty } from "@/components/cart/cart-empty";
import { CartFooter } from "@/components/cart/cart-footer";
import { CartLineRow } from "@/components/cart/cart-line-row";
import {
  closeCart,
  useCartDrawerOpen,
} from "@/lib/cart/drawer-store";
import {
  useCartCount,
  useCartLines,
  useCartPending,
  useCartSubtotalCents,
} from "@/lib/cart/store";
import {
  useBodyScrollLock,
  useEscapeClose,
} from "@/lib/hooks/use-overlay-behaviors";
import { cn } from "@/lib/utils";

/**
 * Right-anchored cart drawer.
 *
 * The whole component is always mounted (no `if (!open) return null`)
 * for two reasons:
 *
 *   1. The slide-in animation needs a stable mount point — toggling
 *      the DOM node on every open/close kills the CSS transition
 *      mid-flight.
 *   2. The `Backdrop` already handles its own portal + fade. Keeping
 *      the panel mounted means the close transition plays out
 *      properly when `open` flips to `false`.
 *
 * Layering:
 *
 *   - Backdrop sits at `z-[60]` (above the sticky header) and uses
 *     `coverHeader` so the whole UI dims, not just page content.
 *   - Panel sits at `z-[70]` above the backdrop, anchored to the
 *     right edge, sliding in via `translate-x`. Width clamps at
 *     `420px` so on widescreen monitors it stays a sidebar rather
 *     than a half-page sheet.
 *   - On viewports under 420px the panel falls back to `100vw`.
 *
 * A11y / interaction:
 *
 *   - Escape closes (window-level listener active only while open).
 *   - The panel uses `role="dialog"` + `aria-modal` + an `aria-label`.
 *   - Body scroll is locked while open by setting `overflow:hidden`
 *     on `<body>`. Restoring the previous value (rather than
 *     blanket-clearing it) is friendlier to other code that might
 *     have set its own lock.
 *   - Tab order: when closed, the panel is `inert`, which both hides
 *     it from screen readers and prevents focus from tabbing into
 *     off-screen controls — cleaner than juggling `tabIndex={-1}` on
 *     every child.
 *   - The header's category / account dropdowns can't be open while
 *     the drawer is — the backdrop is above them visually, and any
 *     outside-click handlers running inside the dropdown still fire,
 *     so they close themselves the moment the cart trigger is
 *     clicked.
 */
export function CartDrawer() {
  const open = useCartDrawerOpen();
  const lines = useCartLines();
  const count = useCartCount();
  const subtotalCents = useCartSubtotalCents();
  const pending = useCartPending();

  /* Currency token comes from the first line — when the cart is empty
   * we don't render the footer, so the fallback is just defensive. */
  const currency = lines[0]?.currency ?? "USD";

  /* Body scroll lock + Escape close — shared primitives, so both
   * the cart drawer and any future Modal speak the same dialect.
   * Implementation lives in `use-overlay-behaviors.ts`. */
  useBodyScrollLock(open);
  useEscapeClose(open, closeCart);

  /* When the drawer opens, move focus into it so keyboard users land
   * on the close button (the first focusable child). Without this,
   * keyboard focus stays on the cart trigger behind the backdrop. */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], [tabindex]:not([tabindex='-1'])",
    );
    first?.focus({ preventScroll: true });
  }, [open]);

  /* SSR-safe portal target. The Backdrop has its own client check, so
   * the panel uses the same pattern for symmetry — no flash, no
   * hydration mismatch. */
  const isClient = useIsClient();
  if (!isClient) return null;

  return (
    <>
      <Backdrop open={open} coverHeader onClick={closeCart} />

      {createPortal(
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal={open ? "true" : undefined}
          aria-label="Cart"
          /* `inert` hides the off-screen panel from a11y trees AND
           * blocks tabbing into it, so we never need to fight focus
           * traps when closed. React 19 recognises `inert` as a real
           * boolean attribute (it polyfilled empty-string semantics
           * for older browsers in v18 — that's no longer needed and
           * now actively warns), so we pass a plain boolean.
           * Modern browsers (Safari 15.5+, Chrome 102+, Firefox 112+)
           * all support the attribute natively. */
          inert={!open}
          className={cn(
            "fixed inset-y-0 right-0 z-[70] flex w-full max-w-[420px] flex-col",
            "bg-[color:var(--color-surface)] shadow-2xl",
            "transition-transform duration-200 ease-out",
            "border-l border-[color:var(--color-border)]",
            // Soft round only on the inboard side; the outboard
            // edge stays flush with the viewport so the drawer
            // still looks anchored to the screen. `overflow-hidden`
            // is required so the footer (with its own surface bg)
            // gets clipped to the corner curve instead of painting
            // a square edge over it.
            "overflow-hidden rounded-l-xl",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <CartHeader count={count} />
          {/* Body wrapper — `relative` so `<LoadingOverlay>` can
           *  drop on top of the scrollable line list AND the
           *  footer while the cart header (with its close button)
           *  stays interactive above it. Same overlay component +
           *  styling as the modal-form surfaces, so the in-flight
           *  feedback reads consistently across the app. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {lines.length === 0 ? (
                <CartEmpty />
              ) : (
                <ul className="flex flex-col divide-y divide-[color:var(--color-border)] px-5">
                  {lines.map((line) => (
                    <CartLineRow key={line.id} line={line} />
                  ))}
                </ul>
              )}
            </div>
            {lines.length > 0 && (
              <CartFooter subtotalCents={subtotalCents} currency={currency} />
            )}
            <LoadingOverlay state={pending ? "loading" : null} />
          </div>
        </aside>,
        document.body,
      )}
    </>
  );
}

/**
 * Drawer header — title with the live item count, plus the close
 * button. Sticks to the top of the panel without scrolling because
 * the parent uses `flex-col` + the body has `flex-1 overflow-y-auto`.
 */
function CartHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
      <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
        Your cart
        {count > 0 && (
          <span className="ml-2 text-sm font-normal text-[color:var(--color-ink-muted)]">
            ({count})
          </span>
        )}
      </h2>
      <button
        type="button"
        onClick={closeCart}
        aria-label="Close cart"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-ink)]"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

/* SSR-safe `mounted` flag — see `backdrop.tsx` for the rationale. */
const subscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
