"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Imperative play/pause coordinator for a stack of `<video>` elements
 * driven by a single `activeIndex`.
 *
 * Shared by every surface that keeps multiple videos mounted at the
 * same time and crossfades between them — the PDP gallery's main
 * viewer (`product-gallery.tsx`) and the full-viewport media
 * lightbox (`media-lightbox.tsx`).
 *
 * Why imperative instead of `autoPlay`:
 *
 *   - Every video stays mounted across navigation so a swap doesn't
 *     trigger a reload, a poster flash, or an autoplay-rejection
 *     re-evaluation. The visible video is selected via opacity at
 *     the layer level; this hook just toggles which one is actually
 *     playing.
 *   - The deactivating video gets `currentTime = 0` so the next
 *     visit starts from frame zero.
 *
 * Usage:
 *
 *     const videoRefs = useActiveVideoControl(activeIndex);
 *
 *     media.map((item, i) => (
 *       item.kind === "video" ? (
 *         <video ref={(el) => { videoRefs.current[i] = el; }} ... />
 *       ) : null
 *     ));
 *
 * Pass `active = false` to globally suspend playback (lightbox
 * while it's closed but still mounted for the exit animation, for
 * example) without fighting the `activeIndex` toggle.
 *
 * `.play()` returns a promise that rejects when autoplay is
 * blocked (mobile Safari low-power mode, etc.). The rejection is
 * swallowed — the video stays paused and the user can hit play on
 * the native controls; an unhandled-rejection warning would just
 * be log noise.
 */
export function useActiveVideoControl(
  activeIndex: number,
  active: boolean = true,
): RefObject<(HTMLVideoElement | null)[]> {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    if (!active) {
      refs.current.forEach((v) => v?.pause());
      return;
    }
    refs.current.forEach((video, i) => {
      if (!video) return;
      if (i === activeIndex) {
        video.play().catch(() => {});
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [active, activeIndex]);

  return refs;
}
