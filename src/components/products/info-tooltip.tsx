"use client";

import { useEffect, useRef, useState } from "react";
import { useIsTouch } from "@/components/device/device-provider";
import { InfoIcon } from "@/components/ui/icons";

/**
 * Inline tooltip — info-circle trigger with a small panel that
 * appears on hover/focus (desktop) or tap (mobile).
 *
 * Desktop: hover or keyboard focus opens the panel via CSS
 * (`group-hover` / `group-focus-within`). No state required.
 *
 * Mobile: a synthetic mouseenter from a tap would briefly flash
 * the panel then immediately hide it once the tap ends — useless.
 * Instead, the button tap toggles a JS-tracked `open` state, the
 * panel reads that state through `data-open` so the same CSS
 * keeps it visible, and a document-level pointerdown listener
 * closes it on tap-outside.
 *
 * The `data-open` channel composes with the CSS hover/focus
 * gates — so on a desktop with a touchscreen (a true hybrid),
 * either path reveals the panel.
 */
export function InfoTooltip({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const isTouch = useIsTouch();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  /* Click-outside-to-close — only attached when open, only on
   * touch. A hover pointer doesn't need it (mouseleave closes via
   * the `group-hover` CSS path), and attaching it there would
   * close the panel on every random click in the page. */
  useEffect(() => {
    if (!open || !isTouch) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, isTouch]);

  return (
    <span
      ref={wrapperRef}
      data-open={open ? "true" : undefined}
      className="group relative inline-flex"
    >
      <button
        type="button"
        aria-label={`More about ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-success)] focus:bg-[color:var(--color-bubble)] focus:text-[color:var(--color-success)] focus:outline-none"
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="invisible absolute bottom-full right-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] -translate-y-0.5 rounded-lg border border-[color:var(--color-border)] bg-white p-3 text-xs leading-relaxed text-[color:var(--color-ink-muted)] opacity-0 shadow-lg shadow-black/10 transition-all duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-data-[open=true]:visible group-data-[open=true]:translate-y-0 group-data-[open=true]:opacity-100"
      >
        <span className="mb-1 block font-semibold text-[color:var(--color-ink)]">
          {title}
        </span>
        {description}
      </span>
    </span>
  );
}
