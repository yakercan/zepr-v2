"use client";

import { ChevronDownIcon } from "@/components/ui/icons";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Pill button that *opens* a large, full-width filter panel.
 *
 * Unlike `<FilterPill>` (small popover anchored to the pill
 * itself), this component is just the launcher chrome — the
 * panel it triggers is rendered separately by the parent bar
 * (`<FilterBarPanel>`), full-width below the entire pill row.
 *
 * Outline variant + chevron rotation match `<FilterPill>` so
 * the two sit side-by-side without looking inconsistent.
 */
export interface FilterPillTriggerProps {
  label: string;
  isOpen: boolean;
  hasSelection: boolean;
  onToggle: () => void;
  /** Optional key for `<ScrollRow>` smooth-centering. Stamped
   *  onto the button as `data-scroll-row-key`; pair with a
   *  matching `activeKey` on the enclosing `<ScrollRow>` and
   *  the trigger auto-centres when it becomes the active pill. */
  scrollKey?: string;
}

export function FilterPillTrigger({
  label,
  isOpen,
  hasSelection,
  onToggle,
  scrollKey,
}: FilterPillTriggerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
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
