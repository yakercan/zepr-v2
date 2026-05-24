"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Crossfade timing — mirrors the React-side release timer to the
 * CSS-side opacity transition (`MEDIA_LAYER_FADE_CLASSES`, with
 * a `duration-200` override on call sites that want the snappier
 * 200ms cadence). Keep the two numbers in lockstep when tuning.
 */
export const CROSSFADE_DURATION_MS = 200;

export interface CrossfadeState {
  /** Currently-visible item. Stable across the swap. */
  activeIndex: number;
  /** Previously-visible item, held at full opacity for the
   *  duration of the swap so the parent backdrop can't bleed
   *  through mid-fade. `null` outside of a transition. */
  outgoingIndex: number | null;
  /** Crossfade-aware navigate. Captures the current active as
   *  outgoing synchronously inside the state setter so React
   *  renders the outgoing layer at full opacity on the very
   *  first frame that the new active starts fading in. Without
   *  this synchronous capture the previous layer would render
   *  as inactive (opacity 0) for one frame and the flash would
   *  be back. */
  navigate: (next: number) => void;
  /** Jump without animating — useful when the parent re-seeds
   *  the index (e.g. opening a lightbox at a fresh thumbnail
   *  click should start at the new index without crossfading
   *  from whatever was last shown). */
  setIndex: (next: number) => void;
}

/**
 * Two-layer crossfade state.
 *
 * Pair with stacked `absolute inset-0` layers using
 * `MEDIA_LAYER_FADE_CLASSES`:
 *
 *     const { activeIndex, outgoingIndex, navigate } = useCrossfade(0);
 *
 *     media.map((item, i) => (
 *       <div
 *         key={item.id}
 *         className={cn(
 *           "absolute inset-0",
 *           MEDIA_LAYER_FADE_CLASSES,
 *           i === activeIndex || i === outgoingIndex
 *             ? "opacity-100"
 *             : "opacity-0",
 *           i === activeIndex
 *             ? "z-10"                    // on top, fades in
 *             : i === outgoingIndex
 *               ? "z-0"                   // immediately below
 *               : "-z-10",                // tucked away
 *         )}
 *       >
 *         {/* item content *\/}
 *       </div>
 *     ));
 *
 * Shared by the product gallery (`product-gallery.tsx`) and the
 * media lightbox (`media-lightbox.tsx`) so the two surfaces feel
 * identical when stepping through media.
 */
export function useCrossfade(initialIndex: number = 0): CrossfadeState {
  const [activeIndex, setActiveIndex] = useState<number>(initialIndex);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);

  const navigate = useCallback((next: number) => {
    setActiveIndex((curr) => {
      if (curr !== next) setOutgoingIndex(curr);
      return next;
    });
  }, []);

  const setIndex = useCallback((next: number) => {
    setActiveIndex(next);
    setOutgoingIndex(null);
  }, []);

  /* Release the outgoing reference once the incoming has reached
   * full opacity. Re-runs on each change naturally cancel
   * in-flight timers via the cleanup return, so rapid
   * navigations always keep `outgoingIndex` pinned to the most
   * recently displaced layer rather than an older one. */
  useEffect(() => {
    if (outgoingIndex === null) return;
    const t = setTimeout(() => setOutgoingIndex(null), CROSSFADE_DURATION_MS);
    return () => clearTimeout(t);
  }, [outgoingIndex]);

  return { activeIndex, outgoingIndex, navigate, setIndex };
}
