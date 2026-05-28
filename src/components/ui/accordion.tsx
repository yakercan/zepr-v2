"use client";

import { useId, useState, type ReactNode } from "react";
import { SmoothCaretIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Generic collapsible-section group.
 *
 * Originally introduced on the PDP for "Details / Reviews /
 * Disclaimer"; lifted to `ui/` so the FAQ page (and anything
 * else with a "scannable index of expandable rows" shape — order
 * details, settings, etc.) can speak the same visual + a11y
 * dialect without forking the primitive.
 *
 * Visual model:
 *
 *   - No top rule on the group, no bottom rule on the group.
 *   - Hairline `divide-y` between siblings — i.e. a top rule on
 *     every item except the first — so each section reads as
 *     one row in a quiet ledger without bracketing the group
 *     on either edge.
 *   - Inside each open section: a hairline separator between the
 *     title row and the body content — frames the open content
 *     as a distinct surface rather than letting it bleed into
 *     the row above.
 *
 * Animation:
 *
 *   - Smooth slide on expand / collapse via the CSS Grid
 *     `grid-template-rows: 0fr ↔ 1fr` trick, which works in every
 *     modern browser and animates a `height: auto`-equivalent
 *     transition without measuring anything in JS.
 *   - Custom open state (`useState`) rather than native
 *     `<details>` because native details don't animate
 *     cross-browser. Trade-off: a small client island. Content
 *     stays in the DOM regardless of open state, so SEO is
 *     unaffected.
 *
 * Composition pattern:
 *
 *     <Accordion>
 *       <AccordionItem title="Details" defaultOpen>
 *         <RichText html={…} />
 *       </AccordionItem>
 *       <AccordionItem title="Reviews">
 *         …
 *       </AccordionItem>
 *     </Accordion>
 */
export function Accordion({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-[color:var(--color-border)]">
      {children}
    </div>
  );
}

export interface AccordionItemProps {
  title: string;
  /** Optional content rendered inline to the right of the title
   *  (before the caret). Lets a section attach quick stats
   *  without re-typing the title prop — Reviews uses it for a
   *  `★ 4.5 (24)` strip so the rating's visible even when the
   *  section is collapsed. */
  titleAside?: ReactNode;
  /** Open by default — only one section should typically use
   *  this. The rest stay collapsed so the page starts compact. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionItem({
  title,
  titleAside,
  defaultOpen,
  children,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const panelId = `accordion-panel-${useId()}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full items-center justify-between gap-3 py-4 text-left",
          "text-base font-semibold text-[color:var(--color-ink)]",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span>{title}</span>
          {titleAside}
        </span>
        <SmoothCaretIcon
          className={cn(
            "h-3 w-3 text-[color:var(--color-ink-secondary)]",
            "transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {/* Animated panel.
       *
       * Grid track switches between `0fr` (closed) and `1fr`
       * (open). CSS transitions interpolate between explicit
       * `<flex>` values cleanly — that's the trick that makes
       * "height auto" animatable without JS measurement.
       *
       * The inner `min-h-0 overflow-hidden` is essential — it
       * lets the grid item shrink below its content's intrinsic
       * height so the clip actually happens at 0fr. */}
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Hairline between the title row and the body — frames
           *  the open content distinctly without adding extra
           *  vertical noise when closed (the whole panel is
           *  clipped). */}
          <div className="border-t border-[color:var(--color-border)]" />
          <div className="pt-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
