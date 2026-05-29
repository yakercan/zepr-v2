"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useIsCompact } from "@/components/device/device-provider";
import { Backdrop } from "@/components/ui/backdrop";
import { CloseIcon } from "@/components/ui/icons";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Sheet } from "@/components/ui/sheet";
import { CartBadge } from "@/components/cart/cart-badge";
import { CartEmpty } from "@/components/cart/cart-empty";
import { CartFooter } from "@/components/cart/cart-footer";
import { CartLineRow } from "@/components/cart/cart-line-row";
import {
  closeCart,
  useCartDrawerOpen,
} from "@/lib/cart/drawer-store";
import {
  useCartLines,
  useCartPending,
  useCartSubtotalCents,
} from "@/lib/cart/store";
import type { CartLine } from "@/types/cart";
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
  const subtotalCents = useCartSubtotalCents();
  const pending = useCartPending();
  /* Compact viewport (below `xl`, where the mobile header shows) gets
   * the Vaul sheet; the wide layout keeps the custom slide-in panel.
   * Keyed on the viewport — not the pointer — so the cart opens in a
   * small desktop window too. */
  const isCompact = useIsCompact();

  /* Currency token comes from the first line — when the cart is empty
   * we don't render the footer, so the fallback is just defensive. */
  const currency = lines[0]?.currency ?? "USD";

  if (isCompact) {
    return (
      <CartDrawerMobile
        open={open}
        lines={lines}
        subtotalCents={subtotalCents}
        currency={currency}
        pending={pending}
      />
    );
  }

  return (
    <CartDrawerDesktop
      open={open}
      lines={lines}
      subtotalCents={subtotalCents}
      currency={currency}
      pending={pending}
    />
  );
}

interface CartChromeProps {
  open: boolean;
  lines: readonly CartLine[];
  subtotalCents: number;
  currency: string;
  pending: boolean;
}

/**
 * Desktop side-anchored cart drawer — the original right-edge
 * sheet preserved verbatim for the desktop branch. Slides in
 * from the right at `max-w-[420px]` over the existing backdrop,
 * with the legacy keyboard-focus / scroll-lock plumbing.
 */
function CartDrawerDesktop({
  open,
  lines,
  subtotalCents,
  currency,
  pending,
}: CartChromeProps) {
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
          <CartHeader />
          {/* Body wrapper — `relative` so `<LoadingOverlay>` can
           *  drop on top of the scrollable line list AND the
           *  footer while the cart header (with its close button)
           *  stays interactive above it. Same overlay component +
           *  styling as the modal-form surfaces, so the in-flight
           *  feedback reads consistently across the app. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <CartScrollableLines lines={lines} />
            {lines.length > 0 && (
              /* The drawer's footer reads as a sticky bottom slab
               * — `border-t` separates it from the scrolling line
               * list above, `bg-[surface]` keeps it opaque so
               * scroll content can't bleed through. `<CartFooter>`
               * itself ships unstyled; chrome lives at the call
               * site so the cart page can re-skin it as a panel
               * card without fighting an inherited border. */
              <CartFooter
                subtotalCents={subtotalCents}
                currency={currency}
                className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
              />
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
 * Mobile cart drawer — right-anchored sheet wrapping the same
 * cart body the desktop drawer renders.
 *
 *   - **Direction matches desktop.** Slides in from the right edge,
 *     full viewport height, max width 420px (same clamp as the
 *     desktop drawer's `max-w-[420px]`). The shopper's mental
 *     model — "cart lives on the right" — carries verbatim across
 *     breakpoints.
 *   - **Vaul still owns the gestures.** Drag right to dismiss,
 *     native scroll inside the body, safe-area-aware footer.
 *     That's the *only* thing the mobile branch needs over the
 *     desktop's custom slide-transform.
 *
 * Body, footer, loading overlay, and empty-state are reused
 * verbatim from the desktop branch — single source of truth for
 * how a cart "looks" once you're inside the drawer.
 */
function CartDrawerMobile({
  open,
  lines,
  subtotalCents,
  currency,
  pending,
}: CartChromeProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCart();
      }}
      direction="right"
      title={
        <span className="inline-flex items-center">
          Your cart
          <CartBadge />
        </span>
      }
      footer={
        lines.length > 0 ? (
          /* Sheet's footer slot already supplies the border-t and
           * surface bg, so we strip those from `<CartFooter>` here
           * to avoid doubling them up. */
          <CartFooter
            subtotalCents={subtotalCents}
            currency={currency}
            className="bg-[color:var(--color-surface)]"
          />
        ) : undefined
      }
    >
      {/* Body wrapper:
       *  - `relative` is the anchor for `<LoadingOverlay>`'s
       *    `absolute inset-0`, so the overlay covers exactly the
       *    cart body (matching the desktop drawer).
       *  - `flex h-full flex-col` propagates the sheet's body
       *    height into children so `<CartEmpty>` can claim
       *    `flex-1` and vertically centre its message when the
       *    cart is empty. Without this the wrapper collapses to
       *    its content height and the empty state stacks at the
       *    top of the panel. */}
      <div className="relative flex h-full flex-col">
        {lines.length === 0 ? (
          <CartEmpty />
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--color-border)] px-5">
            {lines.map((line) => (
              <CartLineRow key={line.id} line={line} />
            ))}
          </ul>
        )}
        <LoadingOverlay state={pending ? "loading" : null} />
      </div>
    </Sheet>
  );
}

/**
 * Scrollable line list shared by both the desktop drawer and
 * any future surface that wants the same "scroll the cart lines
 * with an empty-state fallback" composition. Kept module-local
 * for now — extract to its own file if a third surface needs it.
 */
function CartScrollableLines({ lines }: { lines: readonly CartLine[] }) {
  return (
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
  );
}

/**
 * Drawer header — title with the animated `<CartBadge>`, plus
 * the close button. Sticks to the top of the panel without
 * scrolling because the parent uses `flex-col` + the body has
 * `flex-1 overflow-y-auto`.
 *
 * Badge replaces what used to be a `(N)` parenthetical next to
 * the title. Same brand-orange pill that lives on the favorites
 * link in the header — single visual primitive (`<CountBadgePill>`)
 * so the count language reads identically across surfaces.
 */
function CartHeader() {
  return (
    /* `py-[18px]` (vs the tighter `py-4` everywhere else) gives
     * the row enough vertical room that the `<CartBadge>` pill —
     * which is slightly taller than the title's text line-box —
     * doesn't read as crammed against the top/bottom border. The
     * 2px-each-side bump is small enough that the rest of the
     * drawer doesn't feel padded out. */
    <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-[18px]">
      <h2 className="inline-flex items-center text-base font-semibold text-[color:var(--color-ink)]">
        Your cart
        <CartBadge />
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
