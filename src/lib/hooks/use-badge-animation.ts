"use client";

import { useEffect, useState } from "react";

/**
 * Two-phase appear / disappear animator for the favorites badge.
 *
 * The pill rides three pieces of state:
 *
 *   - `mounted` drives the outer slot's `max-width` slide. Goes
 *     true the frame `count` becomes positive, goes false `delay`
 *     ms after `count` drops back to 0.
 *   - `visible` drives the inner pill's opacity. Goes true `delay`
 *     ms after `mounted` (so the pill fades in *after* the slot
 *     has slid open), goes false the frame `count` drops to 0
 *     (so the pill fades out *before* the slot collapses).
 *   - `display` is the sticky digit shown inside the pill — held
 *     at the last positive count so the pill never flashes "0"
 *     during its fade-out.
 *
 * Keep the consumer's CSS `transition-*` duration in lockstep
 * with `delay` (default 300ms). When they drift you get either
 * an early-collapsing slot mid-fade or a lingering empty slot
 * after the content is gone.
 *
 * Ported from the salespace storefront's watchlist counter.
 */
export interface BadgeAnimationState {
  /** Render the slot at all — drives the width slide. */
  mounted: boolean;
  /** Render the pill at full opacity — drives the inner fade. */
  visible: boolean;
  /** Sticky last-positive count so the pill never flashes "0"
   *  while it's leaving. */
  display: number;
}

export function useBadgeAnimation(
  count: number,
  delay = 300,
): BadgeAnimationState {
  const present = count > 0;

  const [mounted, setMounted] = useState(present);
  const [visible, setVisible] = useState(present);

  /* State machine coupled to `present`. The synchronous half of
   * each transition (mount on open, hide on close) must fire on
   * the same frame the prop flips — that's what makes the slot
   * slide open before the pill fades in, and lets the pill fade
   * out *in place* before the slot collapses. The delayed half
   * rides a timer. `react-hooks/set-state-in-effect` flags the
   * synchronous `setMounted(true)`; wrapping it in
   * `setTimeout(..., 0)` would push it into a macrotask and
   * break the timing contract, so we suppress the rule there. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (present) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      timer = setTimeout(() => setVisible(true), delay);
    } else {
      setVisible(false);
      timer = setTimeout(() => setMounted(false), delay);
    }
    return () => clearTimeout(timer);
  }, [present, delay]);

  /* Canonical "store info from previous renders" pattern — see
   * https://react.dev/reference/react/useState. When `count`
   * goes positive we latch the new value; when it drops to 0
   * we keep showing the last positive value through the fade-
   * out. Setting state during render is fine — React discards
   * the in-flight JSX and re-renders with the updated value in
   * a single commit. */
  const [display, setDisplay] = useState(count);
  if (count > 0 && count !== display) setDisplay(count);

  return { mounted, visible, display };
}
