"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { useIsDesktop } from "@/components/device/device-provider";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom-sheet primitive.
 *
 * Thin wrapper over [Vaul](https://vaul.emilkowal.ski/) that gives
 * the storefront a single, design-locked drawer surface to migrate
 * mobile overlays into. Anything that lives in a `<Modal>` on
 * desktop and benefits from a drag-to-dismiss / multi-snap drawer
 * feel on touch should render `<Sheet>` instead when
 * `useIsMobile()` is true — see the cart drawer, filter panel,
 * size-chart modal etc. for the migration template.
 *
 * # Design dialect
 *
 * The wrapper bakes in our token-driven look so callers don't
 * have to re-style every overlay:
 *
 *   - Rounded-2xl top corners, square bottom.
 *   - Surface bg + hairline border from `--color-surface` /
 *     `--color-border`.
 *   - Hairline drag handle pinned to the top, ink-secondary
 *     coloured, ~36×4px (Vaul's `Handle` default is fine for
 *     touch but a touch too wide; we tone it down via the
 *     classname).
 *   - Overlay tint matches our shared `<Backdrop>` (black/40)
 *     with a soft fade.
 *   - Z-index ladder driven by the `--z-sheet` token in
 *     `globals.css`, so sheets always sit one tier above any
 *     coexisting `<Modal>`s.
 *
 * # Surface area
 *
 * Intentionally tiny — almost every consumer should be able to
 * write:
 *
 * ```tsx
 * <Sheet open={open} onOpenChange={setOpen} title="Cart">
 *   {body}
 * </Sheet>
 * ```
 *
 * For drawers that want a peek / full ladder (cart, filters),
 * pass `snapPoints={[…]}` — Vaul handles the rest. The first
 * snap point becomes the resting state on open; drag past
 * `closeThreshold` (default 0.25) to dismiss.
 *
 * # Desktop short-circuit
 *
 * On `data-device="desktop"` we return `null` *before* mounting
 * Vaul's portal. That means a caller can render `<Sheet>` and
 * `<Modal>` side by side (one for each branch) without worrying
 * about double-rendering, focus competition, or scroll-lock
 * fights — only the matching branch ever attaches to the DOM.
 *
 * Note: the short-circuit reads from the same `DeviceProvider`
 * context the rest of the gate uses, so it tracks live changes
 * (dev `?device=` override, refiner mode flips) without a page
 * reload.
 */
/** Which viewport edge the sheet slides in from. Bottom is the
 *  storefront's default — it's the conventional mobile drawer
 *  position for filters, modals, etc. `right` mirrors the desktop
 *  cart drawer's anchor for visual continuity; `left` is for
 *  hamburger-style nav drawers. `top` is for full-width search /
 *  notification surfaces. */
export type SheetDirection = "bottom" | "right" | "left" | "top";

export interface SheetProps {
  /** Open / closed state — controlled component. */
  open: boolean;
  /** Called with the next open state. Wire to the same setter
   *  the original `<Modal>` used. */
  onOpenChange: (open: boolean) => void;
  /** Which viewport edge the sheet slides in from. Defaults to
   *  `bottom`. */
  direction?: SheetDirection;
  /** Accessible title rendered visually at the top of the sheet
   *  body (also used by screen readers via `Drawer.Title`).
   *
   *  `ReactNode` rather than `string` so headings that pair
   *  inline visual chrome with their text — the cart's
   *  animated `<CartBadge>` next to "Your cart", a filter
   *  sheet's "Filters · 3 applied" count tag — can compose the
   *  heading without a sibling element scrolling away from it. */
  title: ReactNode;
  /** Optional descriptive sub-line under the title (also fed to
   *  `Drawer.Description` for assistive tech). */
  description?: string;
  /** Visual + screen-reader-only?
   *
   *  - **`"visible"`** (default) — title + optional description
   *    render as a sticky header above the body, with the same
   *    border-bottom hairline our modals use.
   *  - **`"sr-only"`** — title still announced, but no visible
   *    chrome. Useful when the body brings its own header
   *    (filter sheet, search sheet) and a stacked one would
   *    look redundant.
   */
  titleMode?: "visible" | "sr-only";
  /** Snap-point ladder. Numbers are 0–1 fractions of viewport
   *  height (e.g. `[0.5, 0.95]` for peek + full); strings are
   *  raw CSS lengths (e.g. `["320px", "100%"]`). Omit for a
   *  single-snap "fills as much as the content needs" sheet. */
  snapPoints?: (number | string)[];
  /** When true, only the drag handle is grabbable for dragging —
   *  the rest of the body scrolls. Defaults to `false` so the
   *  whole header strip drags by default; turn on for sheets
   *  whose body is meant to feel like a normal scrollable page
   *  (e.g. cart line list). */
  handleOnly?: boolean;
  /** Inner body classes. The wrapper owns the chrome; consumers
   *  add their own padding / layout rules here. */
  className?: string;
  /** Render one z-index tier higher (`--z-sheet-elevated`) so this
   *  sheet — and its backdrop — stack *above* another sheet that's
   *  already open. Use for sub-overlays launched from inside a sheet
   *  (e.g. the size-chart sheet opened from the product modal's
   *  variant picker), so the parent sheet dims correctly behind it
   *  instead of bleeding through. Harmless when the sheet opens
   *  standalone — it just lands a tier higher on an empty stack. */
  elevated?: boolean;
  /** Sheet body. */
  children: ReactNode;
  /** Optional sticky footer pinned to the bottom of the sheet
   *  *outside* the scrollable body. Use for sheets whose primary
   *  CTA needs to stay reachable while the body scrolls (cart
   *  → checkout, filter → apply, media-form → submit). The
   *  caller owns its own border / padding; the wrapper just
   *  guarantees the footer never scrolls with the body and that
   *  it respects the device safe-area on iOS via
   *  `pb-[env(safe-area-inset-bottom)]`. */
  footer?: ReactNode;
}

export function Sheet({
  open,
  onOpenChange,
  direction = "bottom",
  title,
  description,
  titleMode = "visible",
  snapPoints,
  handleOnly = false,
  className,
  children,
  footer,
  elevated = false,
}: SheetProps) {
  const isDesktop = useIsDesktop();
  /* Desktop branch: render nothing. Callers pair this with a
   * `<Modal>` rendered behind a `useIsMobile()` check, so the
   * desktop path picks up the modal and the mobile path picks
   * up the sheet. */
  if (isDesktop) return null;

  /* Per-direction chrome bundle. Each direction needs a different
   * combination of:
   *
   *   - anchor + size  : which edge to pin to + viewport dimension
   *                       the panel claims along the axis Vaul
   *                       doesn't move (full width for bottom/top,
   *                       full height for left/right).
   *   - corner radius  : rounded only on the *inboard* side so the
   *                       outboard edge stays flush with the
   *                       viewport.
   *   - drop shadow    : cast away from the anchor edge.
   *   - drag handle    : pinned hairline; orientation + position
   *                       follows the gesture axis.
   *
   * Handle is only rendered for bottom + top sheets — side drawers
   * lift the gesture affordance with a slim border instead, which
   * is the convention every iOS-style sliding sidebar uses. */
  const chrome = {
    bottom: {
      panel: cn(
        "fixed inset-x-0 bottom-0 mt-24 flex max-h-[96%] flex-col",
        "rounded-t-2xl border border-b-0",
        "shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)]",
      ),
      handle: "mx-auto !mt-2.5 !h-1 !w-9",
      showHandle: true,
    },
    top: {
      panel: cn(
        "fixed inset-x-0 top-0 mb-24 flex max-h-[96%] flex-col",
        "rounded-b-2xl border border-t-0",
        "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]",
      ),
      handle: "mx-auto !mb-2.5 !mt-0 !h-1 !w-9",
      showHandle: true,
    },
    right: {
      /* Side-drawer width is `88vw` capped at `max-w-sm` (384px).
       * Same clamp as the mobile nav drawer so cart and menu
       * read as one family — narrower than the desktop drawer's
       * 420px sidebar but a phone has less viewport to spare,
       * and "leave 12vw of the underlying page visible behind
       * the panel" is the convention every iOS-style drawer
       * uses. */
      panel: cn(
        "fixed inset-y-0 right-0 flex w-[88vw] max-w-sm flex-col",
        "rounded-l-2xl border border-r-0",
        "shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.18)]",
      ),
      handle: "",
      showHandle: false,
    },
    left: {
      panel: cn(
        "fixed inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col",
        "rounded-r-2xl border border-l-0",
        "shadow-[12px_0_40px_-12px_rgba(0,0,0,0.18)]",
      ),
      handle: "",
      showHandle: false,
    },
  }[direction];

  /* Base vs elevated tier. Overlay always rides `(panel - 10)` —
   * the same convention the modal ladder uses — so the backdrop
   * tucks just under its own panel and, when elevated, above the
   * parent sheet's panel. */
  const panelZ = elevated ? "var(--z-sheet-elevated)" : "var(--z-sheet)";
  const overlayZ = `calc(${panelZ} - 10)`;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={direction}
      snapPoints={snapPoints}
      handleOnly={handleOnly}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          /* Backdrop tint matches our shared `<Backdrop>` so
           * sheets and modals share a consistent dim
           * affordance. Vaul handles the fade timing. */
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: overlayZ }}
          /* Elevated sheets stack over another open sheet (e.g. the
           * size-chart over the product modal). With two independent
           * modal Vaul roots open at once, Vaul's built-in
           * outside-press dismissal on the top drawer stops firing —
           * only its drag gesture still closes it. The overlay is a
           * plain `pointer-events:auto` div on top, so we wire the
           * backdrop tap to close explicitly. Scoped to `elevated`
           * so single (non-stacked) sheets keep relying on Vaul's
           * native handling unchanged. */
          onClick={elevated ? () => onOpenChange(false) : undefined}
        />
        <Drawer.Content
          /* `aria-describedby={undefined}` opts out of the Radix
           * Dialog "missing Description" warning entirely — we
           * always render a `<Drawer.Description>` below this
           * node, but spelling it out at the content level
           * makes the contract obvious and silences edge cases
           * where the description is provided but Radix hasn't
           * picked up the association yet during fast refresh. */
          aria-describedby={undefined}
          style={{ zIndex: panelZ }}
          className={cn(
            chrome.panel,
            "border-[color:var(--color-border)] bg-[color:var(--color-surface)]",
            "outline-none",
          )}
        >
          {/* Drag handle (bottom + top only — side drawers don't
              use one). Vaul ships a default; we tighten the
              dimensions and tint so it reads as our hairline
              rather than the library's stock pill. */}
          {chrome.showHandle && (
            <Drawer.Handle
              className={cn(
                chrome.handle,
                "!bg-[color:var(--color-border-strong)]",
              )}
            />
          )}

          {/* Title strip. Either visible (most cases) or
              announce-only (search / filter sheets that
              bring their own header). */}
          {titleMode === "visible" ? (
            <header className="flex flex-col gap-1 border-b border-[color:var(--color-border)] px-5 pb-3 pt-4">
              <Drawer.Title className="text-base font-semibold text-[color:var(--color-ink)]">
                {title}
              </Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-[color:var(--color-ink-secondary)]">
                  {description}
                </Drawer.Description>
              ) : (
                /* Radix Dialog (Vaul's underlying primitive) warns
                 * if no `<Description>` is present in the tree.
                 * When the consumer hasn't supplied one, we drop
                 * an sr-only placeholder so the contract holds
                 * without forcing a visible sub-line. */
                <Drawer.Description className="sr-only">
                  {/* Title can be a ReactNode (e.g. cart badge);
                   * we ignore it here and just give assistive tech
                   * a stable announcement. */}
                  Bottom sheet
                </Drawer.Description>
              )}
            </header>
          ) : (
            <>
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
              <Drawer.Description className="sr-only">
                {description ?? "Bottom sheet"}
              </Drawer.Description>
            </>
          )}

          {/* Body. Caller owns padding + layout rules; we just
              guarantee it scrolls when its own height exceeds
              the sheet's. Snap-point sheets need this so
              dragging past the first snap reveals more
              content rather than letting overflow leak below
              the safe-area. */}
          <div className={cn("flex-1 overflow-y-auto", className)}>
            {children}
          </div>

          {/* Sticky footer slot — pinned outside the scrollable
              body so the primary CTA stays reachable as the
              line list / filter set / form scrolls. The padding-
              bottom safe-area-inset means the CTA clears the
              iOS home-indicator without the caller having to
              wire it. */}
          {footer && (
            <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom,0px)]">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
