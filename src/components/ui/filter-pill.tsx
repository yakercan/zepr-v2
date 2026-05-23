"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Click-toggle pill with a popover panel beneath it.
 *
 * The same pill shape main-feed-tabs use, paired with a small
 * portal-less dropdown. Used by the search-page filter bar and
 * (next) the collection-page filter bar — change behaviour here
 * once and every filter surface tracks.
 *
 * Three pill states bundle into one prop pair:
 *
 *   - `isOpen=false`, `hasSelection=false` → idle pill
 *   - `isOpen=false`, `hasSelection=true`  → ink pill (committed
 *                                            selection)
 *   - `isOpen=true`                        → ink pill (active
 *                                            dropdown, regardless
 *                                            of selection)
 *
 * Selection state, panel content, and the actual "what does
 * clicking an option do" are all the caller's concern — this
 * component only owns the pill chrome + open/close mechanics.
 *
 * Why a sibling popover instead of a portal:
 *
 *   The panel is short, anchored to the pill itself, and never
 *   needs to escape an `overflow:hidden` parent (the filter row
 *   is always free-flowing inline-block territory). A sibling
 *   `<div>` with `absolute`/`top-full` skips the React portal
 *   tax entirely — no `createPortal`, no SSR fallback dance, no
 *   z-index ladder beyond `z-30` to sit above the grid.
 *
 * Outside-click + Escape close via lightweight document
 * listeners scoped to `isOpen` — added/removed each cycle so the
 * idle state holds zero listeners.
 */
export interface FilterPillProps {
  /** Pill label. Caller can mix in a selection summary (e.g.
   *  `"Sort: Best Sellers"` or `"Category (3)"`) so the closed
   *  state still communicates what's applied. */
  label: string;
  isOpen: boolean;
  hasSelection: boolean;
  onToggle: () => void;
  /** Dropdown contents — the actual filter UI (radio list,
   *  checkbox list, range slider, etc.). */
  children: ReactNode;
}

export function FilterPill({
  label,
  isOpen,
  hasSelection,
  onToggle,
  children,
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
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        // Active visual when the panel is open OR the caller
        // says there's a committed selection — outline variant
        // (ink border, white fill) so it reads as "selected"
        // without going fully inverted like the homepage feed
        // tabs. Chevron mirrors the open state so the user
        // gets a clear "this expands" affordance.
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

      {isOpen && (
        <div
          // Anchored to the pill, no portal — see top-of-file
          // note. Min/max width keeps short labels (Sort) and
          // long ones (Category list) both legible without
          // chasing intrinsic-width sizing.
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
