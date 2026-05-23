"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  /** Optional ref to a region whose clicks should NOT count as
   *  "outside" the panel (typically the pill-row that triggered
   *  it). Without this, clicking a different pill would fire
   *  outside-click → close, then the click would bubble to the
   *  pill → open — a redundant churn. */
  excludeRef?: React.RefObject<HTMLElement | null>;
}

export function FilterBarPanel({
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
    </div>
  );
}
