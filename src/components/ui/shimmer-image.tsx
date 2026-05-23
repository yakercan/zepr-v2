"use client";

import {
  useCallback,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * `<img>` wrapper that paints a shimmer skeleton overlay until the
 * underlying image fires `onLoad` (or was already in the browser
 * cache when it mounted — handled via the `img.complete` probe in a
 * callback ref).
 *
 * Plain `<img>` rather than `next/image`: these are tiny, already-
 * optimized CDN icons, so Next's optimizer adds nothing while costing
 * us reliable `onLoad` semantics — exactly what drives the fade.
 *
 * State design (React 19-clean):
 *
 *   - `loaded` is a plain boolean.
 *   - When `src` changes, we reset `loaded` *during render* by
 *     comparing against a stored `prevSrc` — the React-blessed
 *     pattern for prop-derived state. No `useEffect`, no
 *     `set-state-in-effect` lint warning.
 *   - The callback ref re-fires whenever `src` changes (we tie its
 *     identity to `[src]`) and synchronously flips `loaded` to true
 *     for cached images. setState in a ref callback runs in the
 *     commit phase — allowed, not flagged.
 *
 * Skeleton and image stay both mounted; we cross-fade with `opacity`
 * so a sub-100ms cache hit never flashes shimmer-then-image.
 */
export interface ShimmerImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  /** Eager fetch (default `lazy`). The categories panel only mounts
   *  on hover so `lazy` is correct there; left as a knob for callers
   *  that want an above-the-fold ShimmerImage. */
  loading?: "lazy" | "eager";
  /** Shape passed through to the underlying `<Skeleton>`. */
  skeletonRounded?: "none" | "md" | "lg" | "full";
}

export function ShimmerImage({
  src,
  onLoad,
  onError,
  className,
  loading = "lazy",
  skeletonRounded = "md",
  alt = "",
  ...imgProps
}: ShimmerImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setLoaded(false);
  }

  // Cache-hit probe — fires once when the <img> first attaches.
  // For in-place src swaps (same ShimmerImage, new src) the probe
  // won't re-fire; we rely on `onLoad` which always fires when the
  // browser commits a new image — even for cached resources, with
  // at most one frame of shimmer. In our header usage the parent
  // re-keys per category, so each src change comes with a fresh
  // mount and the probe handles cache hits synchronously.
  const handleImgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    onLoad?.(e);
  };

  // Layering: <img> stays in flow with no z-index, <Skeleton> follows
  // in DOM order as an absolute overlay so it paints on top while
  // `loaded === false`. Both fade via opacity — unmounting would kill
  // the transition.
  return (
    <span className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={handleImgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={handleLoad}
        onError={onError}
        className={cn(
          "transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
        {...imgProps}
      />
      <Skeleton
        rounded={skeletonRounded}
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          loaded ? "opacity-0" : "opacity-100",
        )}
      />
    </span>
  );
}
