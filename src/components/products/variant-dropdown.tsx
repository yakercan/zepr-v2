"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Single-select dropdown for variant option values. Shares the
 * pill-shaped chrome with the chip pickers so the storefront's
 * "pick one of these" vocabulary stays consistent — the
 * dropdown is just the compact spelling for option rows with
 * more values than a chip row should carry (see
 * `shouldUseDropdown` in `lib/variants.ts`).
 *
 * Two sizes:
 *
 *   - `md` — PDP top picker. Same dimensions as the chip variant.
 *   - `sm` — offer-unit-picker cards. Tighter padding so multi-
 *     option companions fit inline next to a thumbnail.
 *
 * Pure controlled component. Opens a portal-less popover anchored
 * to the button. Outside-click + Escape close via document
 * listeners scoped to the open state — idle dropdowns hold zero
 * listeners. Selecting a value auto-closes; no commit button
 * because there's exactly one slot to fill.
 */

export interface VariantDropdownProps {
  optionName: string;
  /** Currently picked value. `undefined` until the shopper has
   *  committed something; the button label falls back to
   *  "Select <optionName>" in that case. */
  currentValue?: string;
  /** Reachable values for this option under the current upstream
   *  selection. The caller (variant-picker / offer-unit-pickers)
   *  pre-filters via `availableValuesFor` so impossible combos
   *  never appear here. */
  values: ReadonlyArray<string>;
  onSelect: (value: string) => void;
  size?: "md" | "sm";
  className?: string;
}

export function VariantDropdown({
  optionName,
  currentValue,
  values,
  onSelect,
  size = "md",
  className,
}: VariantDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const labelText = currentValue
    ? `${optionName}: ${currentValue}`
    : `Select ${optionName.toLowerCase()}`;

  const isCompact = size === "sm";

  return (
    <div ref={wrapperRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          pillClasses(open || !!currentValue, "outline"),
          "flex items-center gap-1.5",
          isCompact ? "px-3 py-1 text-xs" : "px-4 py-2",
        )}
      >
        <span className="truncate">{labelText}</span>
        <ChevronDownIcon
          className={cn(
            "shrink-0 transition-transform duration-150",
            isCompact ? "h-3.5 w-3.5" : "h-4 w-4",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={optionName}
          className={cn(
            /* Anchored to the trigger, no portal — the buy column
             * never lives inside an `overflow:hidden` parent, so a
             * sibling absolute keeps the bundle small and skips the
             * SSR / z-index dance of `createPortal`. */
            "absolute left-0 top-full z-30 mt-1.5",
            "min-w-[max(140px,100%)] max-w-[260px]",
            /* Cap height so a long value list (20+ colourways)
             * scrolls inside the panel instead of expanding past
             * the viewport. `overflow-y-auto` activates the
             * scrollbar only when needed; `overflow-x-hidden`
             * keeps the rounded right edge clean. */
            "max-h-[140px] overflow-y-auto overflow-x-hidden",
            "rounded-xl border border-[color:var(--color-border)]",
            "bg-white py-1 shadow-lg shadow-black/10",
            "overscroll-contain",
          )}
        >
          {values.map((value) => {
            const selected = currentValue === value;
            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-4 py-2 text-left",
                  isCompact ? "text-xs" : "text-sm",
                  selected
                    ? "bg-[color:var(--color-bubble)] font-semibold text-[color:var(--color-ink)]"
                    : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover-strong)]",
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
