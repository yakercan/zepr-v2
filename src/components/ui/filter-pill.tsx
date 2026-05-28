"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useIsMobile } from "@/components/device/device-provider";
import { Sheet } from "@/components/ui/sheet";
import { ChevronDownIcon } from "@/components/ui/icons";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Click-toggle pill with an attached chooser surface.
 *
 * One contract, two chrome variants picked at runtime by device
 * mode:
 *
 *   - **Desktop** — anchored popover beneath the pill. Same
 *     short, sibling-positioned dropdown the original
 *     `FilterPill` always shipped. No portal, no z-index ladder
 *     beyond `z-30`.
 *   - **Mobile** — bottom sheet via `<Sheet>`. Matches every
 *     other filter surface on mobile (Category / Price / Size
 *     also slide up as sheets), so the Sort by trigger doesn't
 *     read as a one-off popover hanging awkwardly off a
 *     scrolled-in pill. The pill itself stays in place; the
 *     panel slides up modally instead.
 *
 * Three pill states bundle into one prop pair (visible on both
 * variants):
 *
 *   - `isOpen=false`, `hasSelection=false` → idle pill
 *   - `isOpen=false`, `hasSelection=true`  → ink pill (committed
 *                                            selection)
 *   - `isOpen=true`                        → ink pill (active
 *                                            panel)
 *
 * Selection state, panel content, and "what does clicking an
 * option do" are all the caller's concern — this component only
 * owns the pill chrome and the open/close mechanics.
 *
 * Outside-click + Escape close (desktop) ride lightweight
 * document listeners scoped to `isOpen` — added/removed each
 * cycle so the idle state holds zero listeners. The mobile
 * branch delegates that to Vaul via the sheet's overlay.
 */
export interface FilterPillProps {
  /** Pill label. Caller can mix in a selection summary (e.g.
   *  `"Sort: Best Sellers"` or `"Category (3)"`) so the closed
   *  state still communicates what's applied. */
  label: string;
  /** Heading shown in the mobile sheet's title bar. Desktop's
   *  anchored popover doesn't surface a heading — the pill above
   *  it labels the open filter spatially. The sheet variant
   *  needs an explicit title since it's a separate surface, so
   *  pass the short canonical name (e.g. `"Sort by"`) and let
   *  `label` carry the verbose summary on the pill. Defaults to
   *  `label`. */
  title?: string;
  isOpen: boolean;
  hasSelection: boolean;
  onToggle: () => void;
  /** Chooser contents — the actual filter UI (radio list,
   *  checkbox list, etc.). */
  children: ReactNode;
  /** Optional key for `<ScrollRow>` smooth-centering. Stamped
   *  onto the trigger button as `data-scroll-row-key`; pair with
   *  matching `activeKey` on the enclosing `<ScrollRow>` and the
   *  pill auto-centres in the scroll viewport when it becomes
   *  the active one. */
  scrollKey?: string;
}

export function FilterPill(props: FilterPillProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <FilterPillSheet {...props} />
  ) : (
    <FilterPillPopover {...props} />
  );
}

/* ------------------------------------------------------------------ */
/* Shared trigger                                                      */
/* ------------------------------------------------------------------ */

/**
 * The pill button itself — identical between the two variants
 * so the trigger feels the same regardless of what surface
 * opens. Only `aria-haspopup` shifts: `listbox` on desktop
 * (anchored chooser), `dialog` on mobile (modal sheet).
 */
function PillTrigger({
  label,
  isOpen,
  hasSelection,
  onToggle,
  asDialog,
  scrollKey,
}: {
  label: string;
  isOpen: boolean;
  hasSelection: boolean;
  onToggle: () => void;
  asDialog: boolean;
  scrollKey?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-haspopup={asDialog ? "dialog" : "listbox"}
      data-scroll-row-key={scrollKey}
      className={cn(
        pillClasses(isOpen || hasSelection, "outline"),
        "flex items-center gap-1.5",
      )}
    >
      <span>{label}</span>
      <ChevronDownIcon
        className={cn(
          "h-4 w-4 transition-transform duration-150",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop — anchored popover                                          */
/* ------------------------------------------------------------------ */

function FilterPillPopover({
  label,
  isOpen,
  hasSelection,
  onToggle,
  children,
  scrollKey,
}: FilterPillProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) onToggle();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onToggle();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onToggle]);

  return (
    /* `shrink-0` on the wrapper is the belt-and-braces companion
     * to `pillClasses`'s own `shrink-0` — the wrapper is the flex
     * item that actually sits in a parent row (e.g. the
     * filter-bar's `<ScrollRow>`), so it has to refuse to shrink
     * itself if the parent goes `flex-nowrap`. Without this, on
     * mobile the wrapper collapses and the button wraps its label
     * onto multiple stacked lines despite the button's own
     * `shrink-0`. */
    <div ref={wrapperRef} className="relative shrink-0">
      <PillTrigger
        label={label}
        isOpen={isOpen}
        hasSelection={hasSelection}
        onToggle={onToggle}
        asDialog={false}
        scrollKey={scrollKey}
      />

      {isOpen && (
        <div
          /* Anchored to the pill, no portal — short list,
           * never escapes an `overflow:hidden` parent (the
           * filter row is free-flowing inline territory).
           * Min/max width keeps short labels (Sort) and long
           * ones (Category list) both legible without chasing
           * intrinsic-width sizing. */
          className={cn(
            "absolute left-0 top-full z-30 mt-2",
            "min-w-[240px] max-w-[320px]",
            "rounded-2xl border border-[color:var(--color-border)]",
            "bg-white p-2 shadow-lg shadow-black/10",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile — bottom sheet                                               */
/* ------------------------------------------------------------------ */

function FilterPillSheet({
  label,
  title,
  isOpen,
  hasSelection,
  onToggle,
  children,
  scrollKey,
}: FilterPillProps) {
  return (
    /* Fragment, not a positioned wrapper — the sheet portals to
     * the body, so the trigger doesn't need an anchor parent.
     * Keeps the trigger as a clean flex child of whatever row
     * hosts it (no extra wrapping div that could shrink and
     * pancake the label). */
    <>
      <PillTrigger
        label={label}
        isOpen={isOpen}
        hasSelection={hasSelection}
        onToggle={onToggle}
        asDialog
        scrollKey={scrollKey}
      />
      <Sheet
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) onToggle();
        }}
        title={title ?? label}
      >
        <div className="px-4 py-2">{children}</div>
      </Sheet>
    </>
  );
}
