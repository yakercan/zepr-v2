"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Drawer } from "vaul";
import { useIsDesktop } from "@/components/device/device-provider";
import { SearchModal } from "@/components/layout/search-modal";
import {
  ArrowRightIcon,
  CloseIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { SEARCH_BAR_SURFACE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Full-height mobile search sheet.
 *
 * Replaces the always-visible header search bar on touch devices.
 * The mobile header surfaces a tap target (icon button); tapping
 * opens this sheet with the input auto-focused so the OS keyboard
 * snaps in and the shopper can start typing immediately.
 *
 * # Why a Vaul drawer (not the shared `<Sheet>` primitive)
 *
 * Three constraints make this surface a poor fit for the shared
 * primitive:
 *
 *   1. We want a **top-anchored** drawer (slides down from above
 *      the keyboard's safe-area, leaves the suggestions list
 *      anchored to the top of the viewport rather than the
 *      bottom). `<Sheet>` is bottom-only.
 *   2. We don't want the drag handle or the title strip the
 *      shared primitive prints by default — the search input
 *      itself is the affordance.
 *   3. We need direct control over `repositionInputs` so the
 *      keyboard never overlaps the input on iOS.
 *
 * The trade-off is a bit of duplication with the shared Sheet's
 * chrome, but the touch dynamics are still Vaul's.
 *
 * # Composition
 *
 *   ┌─ top sheet ─────────────────────────────────────┐
 *   │ [×] [🔍 query___________________________ →]      │
 *   ├─────────────────────────────────────────────────┤
 *   │  SUGGESTIONS                                    │
 *   │  🔍 cat hanging bed                             │
 *   │  🔍 cat scratch sofa                            │
 *   │  PRODUCTS                                       │
 *   │  [img] Cat Hanging Bed                          │
 *   └─────────────────────────────────────────────────┘
 *
 * Suggestions reuse `<SearchModal>` verbatim — it accepts `query`
 * + `onClose` and renders the same keywords / products sections
 * the desktop bar uses. No duplication of the fetch / debounce
 * logic.
 */
export interface MobileSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSearchSheet({
  open,
  onOpenChange,
}: MobileSearchSheetProps) {
  const router = useRouter();
  /* `?q` from the current URL — pre-fills the input the moment
   * the sheet opens so the shopper sees "what they searched for"
   * instead of an empty field with the placeholder. Same pattern
   * the desktop `<SearchBar>` uses; keeping both surfaces in
   * sync means the bar that launches the sheet and the input
   * inside the sheet present the same value at all times. */
  const urlQuery = useSearchParams().get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Desktop short-circuit (same pattern as `<Sheet>` and the nav
   * drawer) — keeps the sheet from being stuck open if the
   * device gate flips to desktop mid-session. The hooks above
   * still run unconditionally so React's hook-order invariant
   * holds across the render path. */
  const isDesktop = useIsDesktop();

  /* Prop-derived state sync — every time `open` flips from false
   * to true we snap the input back to the URL's `q` value. The
   * shopper either:
   *   - has no `?q` (browsing landing / category page) → the
   *     field opens empty and the placeholder shows.
   *   - has `?q=foo` (already on /search?q=foo) → the field
   *     opens pre-filled with "foo", so they can edit / extend
   *     the query instead of retyping it.
   *
   * Doing it via render-time `setState` rather than an effect
   * keeps React's effect-purity lint happy (see
   * https://react.dev/learn/you-might-not-need-an-effect) and
   * avoids the cascading render that an
   * `if (open) setValue(urlQuery)` inside `useEffect` would
   * trigger. The autofocus *is* a side effect — it has to wait
   * for Vaul's entry animation to settle before iOS will pop the
   * keyboard — so that piece stays in the effect below. */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(urlQuery);
  }

  useEffect(() => {
    if (!open) return;
    /* Micro-delay matches Vaul's default open animation
     * (~250ms). Focusing earlier can be swallowed by the
     * in-flight transition on iOS. */
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 280);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = (next: string) => {
    const trimmed = next.trim();
    router.push(
      trimmed
        ? `/search?q=${encodeURIComponent(trimmed)}`
        : "/search",
    );
    onOpenChange(false);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(value);
  };

  /* `onClose` runs when the user picks a suggestion / product
   * inside `<SearchModal>` — those clicks navigate themselves, we
   * just dismiss the sheet so the shopper lands on the result
   * without an empty sheet lingering behind. */
  const closeFromSuggestion = () => onOpenChange(false);

  if (isDesktop) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="top"
      /* Vaul auto-handles keyboard avoidance when `repositionInputs`
       * is on — the input lifts above the OS keyboard rather than
       * being covered by it on iOS. Default for sheets without
       * snap points is already `true`, but we set it explicitly
       * to make the contract obvious. */
      repositionInputs
    >
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: "calc(var(--z-sheet) - 10)" }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{ zIndex: "var(--z-sheet)" }}
          className={cn(
            /* Top-anchored. Fills the full width and a generous
             * vertical slab so the suggestions list reads as a
             * page in its own right. Rounded only on the bottom
             * corners so the seam against the top of the viewport
             * looks like a peel-down rather than a floating card. */
            "fixed inset-x-0 top-0 flex max-h-[85svh] flex-col",
            "rounded-b-2xl border border-t-0 border-[color:var(--color-border)] bg-[color:var(--color-surface)]",
            "outline-none",
            "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]",
          )}
        >
          {/* Accessibility scaffolding. The visual chrome already
           * communicates "search" via the input + icon; the title
           * is just for assistive tech. */}
          <Drawer.Title className="sr-only">Search</Drawer.Title>
          <Drawer.Description className="sr-only">
            Search products, brands, and more
          </Drawer.Description>

          <form
            role="search"
            action="/search"
            method="get"
            onSubmit={handleSubmit}
            className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border)] px-3 py-3"
          >
            {/* Close — tap-target mirrors the standard mobile
             *  pattern (left-anchored dismiss in a full-width
             *  sheet). Sits before the input so the shopper can
             *  bail without reaching across the screen. */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-ink)]"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            <div className="relative h-10 min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-secondary)]" />
              <input
                ref={inputRef}
                name="q"
                type="search"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Search products, brands, and more"
                autoComplete="off"
                /* `enterkeyhint="search"` swaps the iOS / Android
                 * return key's label to "Search", matching the
                 * sheet's intent. Cheap WCAG-aligned polish. */
                enterKeyHint="search"
                /* The sheet input wears the desktop bar's *active*
                 * look (white fill + 2px ink ring) regardless of
                 * focus. Inside the search drawer, "engaged" is
                 * the only state that makes sense — the shopper
                 * opened the surface to search; we don't need a
                 * resting visual that asks them to focus the
                 * input before it looks ready. Skipping the
                 * `focus:`-prefixed promotion also dodges a Vaul
                 * + iOS `repositionInputs` flicker where the
                 * focus styles toggle on a half-beat as the OS
                 * keyboard slides in. */
                className={cn(
                  SEARCH_BAR_SURFACE_CLASSES,
                  "w-full pl-9 pr-3 placeholder:text-[color:var(--color-ink-muted)]",
                  "bg-white ring-2 ring-[color:var(--color-ink)]",
                )}
              />
            </div>

            {/* Submit — always rendered, regardless of input
             *  value, so the right edge of the row stays visually
             *  stable from open → typing → submit. Empty submit
             *  routes to `/search` (no `?q=`), which lands the
             *  shopper on the search surface itself. Brand-orange
             *  matches the desktop bar's submit affordance. */}
            <button
              type="submit"
              aria-label="Search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--color-brand)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-brand-hover)]"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </form>

          {/* Suggestions surface — re-uses the desktop search
           *  modal in `embedded` mode, which strips the floating
           *  chrome (absolute positioning, rounded border, shadow)
           *  so the suggestions render as a normal in-flow block.
           *  With 2 keyword + 3 product results capped on mobile
           *  (see `search-modal.tsx`), the list fits comfortably
           *  inside the sheet's `max-h-[85svh]` slab without
           *  needing an explicit body-scroll container. */}
          <SearchModal
            query={value}
            open
            embedded
            onClose={closeFromSuggestion}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
