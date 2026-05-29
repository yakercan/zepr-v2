"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import { useIsTouch } from "@/components/device/device-provider";
import { PlayIcon } from "@/components/ui/icons";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import {
  MEDIA_HOVER_ZOOM_CLASSES,
  MEDIA_LAYER_FADE_CLASSES,
  MEDIA_OVERLAY_BUBBLE_CLASSES,
  MEDIA_STAGE_CLASSES,
} from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { SearchProduct } from "@/types/product";

/**
 * Media tile for the product card — owns the square hero area
 * including the primary image, the hover overlay (image or
 * video), any badge / scrim overlays passed as `children`, and
 * the hover interaction itself.
 *
 * Carries the `group/media` named group so every hover effect on
 * the media (image zoom, opacity swap, video play) triggers ONLY
 * when the cursor is inside this tile. Hovering the info row
 * (title / price / Add-to-Cart) below it leaves the media
 * untouched.
 *
 * Hover priority: video > secondary image > nothing. Decided in
 * the search normalizer (`lib/salespace/search.ts`); this
 * component just renders whichever URLs are present.
 *
 * Performance shape:
 *
 *   - **Image-only hover** is pure CSS — `group-hover/media`
 *     opacity transition, zero JS.
 *   - **Video hover** uses one ref + two handlers, attached to
 *     the *outer wrapper* (not the video element). That way the
 *     video keeps playing when the cursor moves onto a sibling
 *     inside the tile (free-shipping badge, sold-out scrim);
 *     `mouseleave` only fires when the cursor exits the tile
 *     entirely. `preload="none"` means off-screen and
 *     never-hovered cards download zero bytes.
 *   - **Touch devices** have no hover state, so neither path
 *     activates and no JS runs on tap.
 */
export function ProductCardMedia({
  product,
  eager = false,
  children,
}: {
  product: SearchProduct;
  /** Eager-load the primary image. Pass `true` for above-the-fold
   *  cards so the LCP image isn't deferred. */
  eager?: boolean;
  /** Overlays painted on top of the swap — free-shipping callout,
   *  sold-out scrim, future wishlist heart, etc. Rendered after
   *  the hover element in DOM order so they always sit on top. */
  children?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(product.hover_video_url);
  /* On mobile there's no "hover" to drive — and a synthetic
   * mouseenter from iOS Safari on first tap would briefly play the
   * video before the navigation fires, which feels glitchy. Drop
   * the handlers entirely; the primary image is what the shopper
   * sees, and the product detail page carries the canonical media. */
  const isTouch = useIsTouch();
  const hoverInteractive = hasVideo && !isTouch;

  function handleEnter(_e: MouseEvent<HTMLDivElement>) {
    // play() returns a promise; swallow rejection silently. If
    // the browser blocks autoplay (rare for muted videos), the
    // user just sees the primary image — graceful degradation.
    void videoRef.current?.play().catch(() => {});
  }
  function handleLeave(_e: MouseEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  }

  return (
    <div
      className={MEDIA_STAGE_CLASSES}
      onMouseEnter={hoverInteractive ? handleEnter : undefined}
      onMouseLeave={hoverInteractive ? handleLeave : undefined}
    >
      <ShimmerImage
        src={product.image_url}
        alt={product.title}
        loading={eager ? "eager" : "lazy"}
        wrapperClassName="block h-full w-full"
        className={MEDIA_HOVER_ZOOM_CLASSES}
        skeletonRounded="lg"
      />

      {/* Hover overlay — picks ONE based on what's available.
          Sits above the primary, below the children, so badges /
          scrims always paint on top of the swap. Renders nothing
          for products with no hover media (zero markup cost).
          The overlay carries the fade timing only (not the hover
          zoom): scaling sits on the primary underneath so the
          tile reads as zooming as a whole while the overlay
          dissolves in on top. */}
      {product.hover_video_url ? (
        <video
          ref={videoRef}
          src={product.hover_video_url}
          muted
          loop
          playsInline
          preload="none"
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            MEDIA_LAYER_FADE_CLASSES,
            "opacity-0 group-hover/media:opacity-100",
          )}
        />
      ) : product.hover_image_url ? (
        // Plain `<img>` for the same reason `<ShimmerImage>` uses
        // one — these are already-optimized CDN URLs, so
        // `next/image` would add a request hop for no payoff.
        // `pointer-events-none` so clicks pass through to the
        // parent <Link> for navigation.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.hover_image_url}
          alt=""
          loading="lazy"
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-cover",
            MEDIA_LAYER_FADE_CLASSES,
            "opacity-0 group-hover/media:opacity-100",
          )}
        />
      ) : null}

      {/* "Has a video preview" indicator — visible by default so
          shoppers know the affordance exists, fades out as soon
          as the whole card is hovered (the user has signalled
          attention; the indicator's job of *advertising* the
          affordance is done). Card-level `group-hover` rather
          than media-only so the indicator clears in step with
          the favorite button revealing — both surfaces respond
          to the same "card focused" signal. `aria-hidden`
          because the video preview is a hover-only convenience —
          the product page carries the canonical media. */}
      {hasVideo && (
        <div
          aria-hidden
          className={cn(
            MEDIA_OVERLAY_BUBBLE_CLASSES,
            "pointer-events-none absolute left-2 top-2 h-8 w-8 opacity-100 group-hover:opacity-0",
          )}
        >
          <PlayIcon className="h-5 w-5" />
        </div>
      )}

      {children}
    </div>
  );
}
