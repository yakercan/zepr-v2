"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useIsMobile } from "@/components/device/device-provider";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Full-width panel that sits below the filter pill row.
 *
 * Anchored to a `relative` parent (the filter-bar wrapper) and
 * stretched to its full width via `absolute left-0 right-0` —
 * one shared shell that swaps content based on whichever pill
 * (Category / Price / Size) opened it.
 *
 * Footer pattern lifted from the original zepr storefront:
 *
 *   - **Reset** (left) clears the staged value for the active
 *     filter only — caller wires it up via `onReset`.
 *   - **Show results** (right) closes the panel and commits
 *     the staged state — caller wires the commit through
 *     `onApply`. We deliberately don't show a live count: the
 *     count would only stay accurate by previewing every staged
 *     toggle against the upstream, which (a) costs a network
 *     round-trip per click and (b) lies about the staged total
 *     in the interim. Cleaner to just label the action.
 *
 * The panel does *not* own the staged state — the parent
 * (`<SearchFilters>` today) holds it and passes the staging UI
 * in as `children`. Closing the panel without applying
 * naturally discards the in-flight changes, no extra cleanup.
 *
 * Outside-click + Escape close via cheap document listeners
 * attached only while open — idle state holds zero listeners.
 *
 * `excludeRef` lets the caller exempt the pill-row from
 * outside-click handling, so clicking another pill closes
 * (the panel still closes via `onClose`) without firing both
 * close + reopen back-to-back.
 */
export interface FilterBarPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
  children: ReactNode;
  /** Sheet heading on mobile. The desktop inline panel doesn't
   *  surface a heading (the pill above it already labels the
   *  open filter); on mobile the sheet replaces the spatial
   *  affordance the pill provided, so it needs an explicit
   *  title — caller passes "Category" / "Price" / "Size" / etc. */
  title?: string;
  /** Optional ref to a region whose clicks should NOT count as
   *  "outside" the panel (typically the pill-row that triggered
   *  it). Without this, clicking a different pill would fire
   *  outside-click → close, then the click would bubble to the
   *  pill → open — a redundant churn.
   *
   *  Only the desktop branch consults this — Vaul handles
   *  outside-click on its own via the portal overlay. */
  excludeRef?: React.RefObject<HTMLElement | null>;
}

export function FilterBarPanel(props: FilterBarPanelProps) {
  const isMobile = useIsMobile();
  return isMobile ? <FilterBarSheetMobile {...props} /> : <FilterBarInlineDesktop {...props} />;
}

/**
 * Desktop branch — verbatim copy of the original inline-absolute
 * panel. Lives below the pill row, owns its own outside-click
 * and Escape handlers, and disappears entirely when closed. The
 * `excludeRef` lets the caller exempt the pill-row from outside-
 * click handling so clicking a different pill doesn't churn
 * (close → open) in the same tick.
 */
function FilterBarInlineDesktop({
  isOpen,
  onClose,
  onReset,
  onApply,
  children,
  excludeRef,
}: FilterBarPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (excludeRef?.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose, excludeRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      className={cn(
        // Full-width, anchored to the parent's bottom edge.
        "absolute left-0 right-0 top-full z-30 mt-2",
        "rounded-2xl border border-[color:var(--color-border)]",
        "bg-white shadow-lg shadow-black/10",
      )}
    >
      <div className="p-4">{children}</div>
      <FilterFooter onReset={onReset} onApply={onApply} />
    </div>
  );
}

/**
 * Mobile branch — bottom sheet at full-height (90% snap) so the
 * shopper can sift through chip grids and price inputs without
 * the inline-absolute panel's "can't see your previous results"
 * problem on a 375px viewport. Reset and Show results stay
 * sticky at the bottom via the sheet's footer slot so neither
 * commit path ever scrolls off-screen.
 */
function FilterBarSheetMobile({
  isOpen,
  onClose,
  onReset,
  onApply,
  children,
  title,
}: FilterBarPanelProps) {
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title ?? "Filters"}
      snapPoints={[0.9]}
      footer={<FilterFooter onReset={onReset} onApply={onApply} />}
    >
      <div className="px-4 py-4">{children}</div>
    </Sheet>
  );
}

/**
 * Shared Reset / Show-results action row. Stays visually
 * identical between desktop's inline panel footer and mobile's
 * sticky sheet footer so the commit affordance reads as the
 * same control on either surface.
 */
function FilterFooter({
  onReset,
  onApply,
}: {
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        "border-t border-[color:var(--color-border)] px-4 py-3",
      )}
    >
      <button
        type="button"
        onClick={onReset}
        className={cn(
          "text-sm font-medium",
          "text-[color:var(--color-ink-muted)]",
          "transition-colors hover:text-[color:var(--color-ink)]",
        )}
      >
        Reset
      </button>
      <button type="button" onClick={onApply} className="btn-primary">
        Show results
      </button>
    </div>
  );
}
