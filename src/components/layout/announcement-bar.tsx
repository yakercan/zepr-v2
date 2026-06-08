"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky promo announcement bar pinned above the site header.
 *
 * A black strip that cycles a short, fixed list of marketing lines
 * with a vertical "roll-up" transition between them — each message
 * slides up and out as the next slides up into place.
 *
 * # Sticky stacking
 *
 * The bar pins at `top-0`; the header pins right below it at
 * `top-[var(--announcement-h)]` (see `site-header` / `mobile-header`).
 * Both stay on screen while scrolling — the bar is always the
 * topmost strip. The shared `--announcement-h` token keeps the
 * bar's height and the header's offset in lockstep.
 *
 * # Roll-up mechanic
 *
 * A vertical track holds the messages stacked top-to-bottom and is
 * translated by `-index × 100%`. To loop seamlessly *in one
 * direction* (always upward), the first message is duplicated at the
 * end: the track animates 0 → 1 → 2 → 3 (the clone), and on reaching
 * the clone it snaps back to 0 with the transition disabled for that
 * single frame, so the rewind is invisible. Index advances on a
 * fixed interval, not per-item, so the cadence is uniform.
 *
 * # Performance / correctness
 *
 * - Transform-only animation (GPU compositor; no layout/paint).
 * - All real messages live in the DOM for crawlers/SEO; the clone is
 *   `aria-hidden`.
 * - SSR-safe: first paint shows message 0 with the track at 0; the
 *   interval only starts after mount, so no hydration mismatch.
 * - `motion-reduce:transition-none` honours reduced-motion — messages
 *   still rotate, they just hard-cut instead of sliding.
 */

const MESSAGES = ["LIMITED TIME DEAL", "BUY 2 SAVE 20%", "BUY 3 SAVE 30%"];

/** Dwell time per message before it rolls to the next. */
const INTERVAL_MS = 3000;

/** Roll transition duration — also the window we wait before the
 *  invisible clone→first snap-back. Keep in sync with the
 *  `duration-[…]` utility on the track. */
const ROLL_MS = 600;

export function AnnouncementBar() {
  /* `index` walks 0 … MESSAGES.length (inclusive). The terminal
   * value lands on the appended clone of message 0; `animate` is
   * flipped off for the single frame that snaps it back to a real 0
   * so the reset never shows a reverse scroll. */
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => i + 1);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (index !== MESSAGES.length) return;
    /* We've rolled onto the clone. After the slide finishes, kill the
     * transition, jump to the real first message, then re-enable the
     * transition on the next frame for the following roll. */
    const snap = window.setTimeout(() => {
      setAnimate(false);
      setIndex(0);
      requestAnimationFrame(() => setAnimate(true));
    }, ROLL_MS);
    return () => window.clearTimeout(snap);
  }, [index]);

  return (
    <div
      className="sticky top-0 flex items-center justify-center overflow-hidden bg-black text-white"
      style={{ height: "var(--announcement-h)", zIndex: "var(--z-header)" }}
      role="region"
      aria-label="Announcements"
    >
      <div
        className={cn(
          "w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          /* Disabled for the single clone→first snap-back frame, and
           * always under reduced-motion (messages hard-cut). */
          "motion-reduce:transition-none",
          !animate && "!transition-none",
        )}
        style={{
          height: "var(--announcement-h)",
          transform: `translateY(-${index * 100}%)`,
        }}
      >
        {[...MESSAGES, MESSAGES[0]].map((message, i) => (
          <div
            key={i}
            aria-hidden={i === MESSAGES.length ? true : undefined}
            className="flex w-full items-center justify-center px-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ height: "var(--announcement-h)" }}
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
