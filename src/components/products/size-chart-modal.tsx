"use client";

import { useState } from "react";

import { useIsMobile } from "@/components/device/device-provider";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";
import { parseSizeTable, type SizeChart } from "@/lib/size-chart";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Size-chart modal — opens from the "Size guide" link in the
 * variant picker.
 *
 * Two Shopify metafields drive the body:
 *
 *   - `custom.size_inches` → inches-unit table
 *   - `custom.size_cm`     → centimetres-unit table
 *
 * Either or both may be set. Default unit is inches (matches the
 * legacy storefront's behaviour and the catalogue's US-first
 * audience); the unit toggle only renders when both sides are
 * present so the shopper never lands on an empty tab.
 *
 *   ┌─ Modal: "Size Chart" ─────────────────┐
 *   │ ┌─ [ Inches ] [  CM   ] ──┐           │
 *   │ │  ^active                 │           │
 *   │ ├────┬────────┬───────────┤           │
 *   │ │ Size │ Length │ Width     │           │
 *   │ ├──────┼────────┼───────────┤           │
 *   │ │  S   │  26    │  18       │           │
 *   │ │  M   │  27    │  19       │           │
 *   │ └──────┴────────┴───────────┘           │
 *   └─────────────────────────────────────────┘
 *
 * Reuse on purpose:
 *
 *   - `<Modal>` for the shell — same animation, scroll lock,
 *     focus management, and backdrop the rest of the app's
 *     overlays speak.
 *   - `pillClasses(active, "outline")` for the unit toggle —
 *     same pill dialect the variant picker, feed tabs, and
 *     filter pills use, so the toggle reads as part of the
 *     storefront's design language rather than a one-off
 *     control.
 *   - `parseSizeTable` from `lib/size-chart.ts` — single
 *     interpretation of the metafield's whitespace rules,
 *     shared with the trigger gate.
 *
 * Render contract: this component does *not* gate itself on
 * presence — the caller is expected to have already checked
 * `hasSizeChart()` before mounting and rendering the trigger.
 * The internal `noUsableTable` branch only catches the edge
 * case where a chart side parses to zero rows mid-session
 * (admin edited the metafield to empty while a tab was open).
 */
export interface SizeChartModalProps {
  open: boolean;
  onClose: () => void;
  chart: SizeChart;
}

export function SizeChartModal({ open, onClose, chart }: SizeChartModalProps) {
  const hasInches = Boolean(chart.inches?.trim());
  const hasCm = Boolean(chart.cm?.trim());

  /* Inches default — matches the legacy storefront. Falls back
   * to cm when only the metric side is filled so the modal
   * never opens on an empty tab. The selection persists across
   * re-opens during the same mount, which is the right default:
   * a shopper who picked cm once is likely shopping in cm for
   * subsequent products too. */
  const [unit, setUnit] = useState<"inches" | "cm">(
    hasInches ? "inches" : "cm",
  );
  const showToggle = hasInches && hasCm;

  const activeRaw =
    unit === "inches" && hasInches
      ? chart.inches!
      : hasCm
        ? chart.cm!
        : (chart.inches ?? "");
  const rows = parseSizeTable(activeRaw);
  const headerRow = rows[0];
  const bodyRows = rows.slice(1);

  const isMobile = useIsMobile();

  /* Shared body — table-heavy content the desktop modal pads
   * inside its own padding box. The mobile sheet body inherits
   * the sheet's body padding via `className`, so the inner
   * wrapper here only owns the flex layout. */
  const body = (
    <>
      {showToggle && (
          /* Inline pill toggle — same outline dialect as the
           * variant chips. `inline-flex` keeps the row's width to
           * its content (two pills + 8px gap) rather than
           * stretching across the panel. */
          <div
            role="group"
            aria-label="Units"
            className="inline-flex w-fit gap-2"
          >
            <button
              type="button"
              onClick={() => setUnit("inches")}
              aria-pressed={unit === "inches"}
              className={cn(pillClasses(unit === "inches", "outline"), "px-4 py-2")}
            >
              Inches
            </button>
            <button
              type="button"
              onClick={() => setUnit("cm")}
              aria-pressed={unit === "cm"}
              className={cn(pillClasses(unit === "cm", "outline"), "px-4 py-2")}
            >
              CM
            </button>
          </div>
        )}

        {rows.length === 0 || !headerRow ? (
          <NoUsableTable />
        ) : (
          /* Horizontal scroll for wide charts (lots of columns)
           * so the panel keeps its `max-w-lg` cap rather than
           * blowing out on a 6+ column table. `text-sm` matches
           * the variant-picker chip text so the chart reads as
           * part of the same control.
           *
           * Row separators ride `divide-y` on `<tbody>` rather
           * than a per-cell `border-b` so the last row doesn't
           * paint a stray line just inside the panel's bottom
           * edge (which would read as a phantom footer divider
           * even though the modal has no footer). */
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {headerRow.map((cell, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap border-b-2 border-[color:var(--color-border)] px-3 py-2.5 text-left font-semibold text-[color:var(--color-ink)]"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {bodyRows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={
                      rowIdx % 2 === 0
                        ? "bg-[color:var(--color-surface-muted)]"
                        : "bg-[color:var(--color-surface)]"
                    }
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="whitespace-nowrap px-3 py-2.5 text-[color:var(--color-ink-muted)]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title="Size Chart"
        /* Elevated tier: the size guide is launched from the variant
         * picker, which on mobile lives *inside* the product modal's
         * own sheet. Without the bump both sheets share `--z-sheet`,
         * so this backdrop would slip under the product modal's panel
         * and the two bottom sheets would overlap instead of stacking.
         * `elevated` lifts it a full tier so the product modal dims
         * cleanly behind it. (No-op when the guide is opened from the
         * PDP, where it's the only sheet on the stack.) */
        elevated
        className="flex flex-col gap-5 px-5 py-4"
      >
        {body}
      </Sheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Size Chart" className="max-w-lg">
      <div className="flex flex-col gap-5 p-5">{body}</div>
    </Modal>
  );
}

/* Edge-case fallback — see `<SizeChartModal>`'s docstring. */
function NoUsableTable() {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--color-border)] px-4 py-6 text-center text-sm text-[color:var(--color-ink-muted)]">
      No size data available right now.
    </div>
  );
}
