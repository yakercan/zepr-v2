"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Promo announcement bar — a black strip above the site header
 * (scrolls away with the page; not sticky, so only the header pins).
 *
 * Shows all promo lines on one row, joined by a middle dot:
 *
 *   LIMITED TIME DEAL · BUY 2 GET 20% OFF · BUY 3 GET 30% OFF
 *
 * # Fit vs. scroll
 *
 * When the line fits the viewport it's simply centred and static.
 * When it doesn't (narrow screens), it becomes a right-to-left
 * marquee so every word stays readable instead of clipping. The
 * decision is measured from a hidden probe span against the bar's
 * width and re-checked on resize via a `ResizeObserver`.
 *
 * # Marquee mechanic
 *
 * The track holds two identical copies; the `marquee` keyframe
 * translates it by `-50%` (one copy width) on a loop, so copy 2
 * slides into copy 1's place seamlessly. Duration is derived from
 * the content width for a constant scroll speed regardless of how
 * far the line overflows.
 *
 * # Correctness
 *
 * - SSR-safe: first paint is the static (non-marquee) branch on both
 *   server and client; the marquee only turns on after mount, so no
 *   hydration mismatch.
 * - `motion-reduce:animate-none` halts the scroll for reduced-motion
 *   users (the line rests left-aligned).
 */

const MESSAGES = ["LIMITED TIME DEALS", "BUY 2 GET 20% OFF", "BUY 3 GET 30% OFF"];

/** Non-breaking-space-padded middle dot between messages, so the
 *  separators never collapse or wrap away from their neighbours. */
const SEPARATOR = "\u00A0\u00A0\u00A0\u00A0·\u00A0\u00A0\u00A0\u00A0";

/** The static (centred) line — no trailing separator. */
const LINE = MESSAGES.join(SEPARATOR);

/** One marquee repetition: the line plus a trailing separator. Two of
 *  these back-to-back put an identical dot + gap at every junction
 *  including the wrap point (…30% · LIMITED TIME DEALS…), so the loop
 *  reads as one continuous ticker rather than restarting. */
const MARQUEE_SEGMENT = `${LINE}${SEPARATOR}`;

/** Shared type styling for the visible copies and the hidden probe,
 *  so the width measurement matches what's painted to the pixel. */
const TEXT_CLASSES =
  "whitespace-nowrap text-sm font-semibold uppercase tracking-wide";

/** Marquee pace in px/sec — duration scales with content width so
 *  the strip always scrolls at this speed. */
const MARQUEE_SPEED_PX_PER_S = 40;

/** Slack (px) added to the fit test so the marquee engages *before*
 *  the line is jammed edge-to-edge: it slides whenever the content
 *  comes within this many px of the bar's width, not only when it
 *  strictly overflows. Larger value → slides across a wider range of
 *  viewport widths. */
const MARQUEE_FIT_BUFFER_PX = 48;

export function AnnouncementBar() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [marquee, setMarquee] = useState(false);
  const [durationS, setDurationS] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const probe = probeRef.current;
    if (!viewport || !probe) return;

    const update = () => {
      const contentWidth = probe.scrollWidth;
      setMarquee(contentWidth > viewport.clientWidth - MARQUEE_FIT_BUFFER_PX);
      setDurationS(contentWidth / MARQUEE_SPEED_PX_PER_S);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      className="relative flex h-9 items-center overflow-hidden bg-black text-white"
      role="region"
      aria-label="Announcements"
    >
      {/* Hidden width probe — never painted, no layout footprint;
          only its `scrollWidth` is read to decide fit vs. scroll. */}
      <span
        ref={probeRef}
        aria-hidden
        className={cn(TEXT_CLASSES, "pointer-events-none invisible absolute")}
      >
        {LINE}
      </span>

      {marquee ? (
        <div
          /* Animation set inline (not via a Tailwind utility) so it
             can't be silently dropped by the OS "reduce motion"
             setting — when the line overflows, the slide is the only
             way to read the whole message, so it always runs. */
          className="flex w-max"
          style={{ animation: `marquee ${durationS}s linear infinite` }}
        >
          {/* Two identical copies (each ending in a separator);
              `-50%` lands copy 2 exactly where copy 1 started, so the
              dot + gap at the wrap matches the internal ones. */}
          <span className={TEXT_CLASSES}>{MARQUEE_SEGMENT}</span>
          <span className={TEXT_CLASSES} aria-hidden>
            {MARQUEE_SEGMENT}
          </span>
        </div>
      ) : (
        <div className="flex w-full justify-center px-4">
          <span className={TEXT_CLASSES}>{LINE}</span>
        </div>
      )}
    </div>
  );
}
