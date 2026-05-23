"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PlayIcon, SmoothCaretIcon } from "@/components/ui/icons";
import { MEDIA_OVERLAY_BUBBLE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/types/product";

/**
 * Product media gallery — images + videos with a vertical
 * thumbnail rail flush against the top of the main viewer.
 *
 * Reusable across surfaces:
 *
 *   - PDP left column        (full-width, large main view)
 *   - Variant-pick modal     (smaller main view, same UX)
 *
 * Width-fluid — adapts to whatever container gives it space.
 *
 *     ┌──┐  ┌─[<]──────────[>]──────┐
 *     │t1│  │                       │
 *     ├──┤  │                       │
 *     │t2│  │   main viewer         │
 *     ├──┤  │   (image | video)     │
 *     │t3│  │                       │
 *     ├──┤  │                       │
 *     │t4│  └───────────────────────┘
 *     └──┘
 *
 * Rail overflow: native vertical scroll (wheel + touch +
 * trackpad). Scrollbar chrome is hidden so the rail reads cleanly
 * against the page; the visual hint that more thumbs exist is the
 * last thumbnail being clipped at the rail's bottom edge.
 *
 * Main viewer overlays:
 *
 *   - Prev / next bubbles at the vertical midline, rendered only
 *     when a step exists in that direction (no dead arrows at
 *     the first / last item). Shared
 *     `MEDIA_OVERLAY_BUBBLE_CLASSES` so the chrome matches the
 *     banner slider and product-card video bubble.
 *
 * Interaction:
 *
 *   - Click a thumb → activate.
 *   - Hover a thumb → activate (mouse only; touch falls back to
 *     tap). Legacy storefront idiom — lets a shopper sweep
 *     through the gallery without clicks.
 *   - Prev / next buttons step in order.
 *   - Stepping past the visible thumbs auto-scrolls the rail so
 *     the active thumb stays in view (`scrollIntoView`).
 *
 * Implementation notes:
 *
 *   - `"use client"` — `useState`-driven active index. Tiny
 *     client island; everything else stays RSC.
 *   - First image gets `priority` so it counts as the LCP.
 *   - Main viewer media stays mounted across navigation; the
 *     visible item is selected via opacity (see `<GalleryMain>`),
 *     so videos don't reload and posters don't flash on switch.
 *     Hover + crossfade chrome are the same classes the product
 *     card uses (`group-hover/media:scale-[1.03]`, opacity swap),
 *     so the two surfaces look and feel identical.
 */

export interface ProductGalleryProps {
  media: ReadonlyArray<ProductMedia>;
  /** Falls back as alt text when an individual image lacks one. */
  title: string;
  className?: string;
}

export function ProductGallery({
  media,
  title,
  className,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (media.length === 0) {
    return (
      <div
        aria-hidden
        className={cn(
          "aspect-square rounded-2xl bg-[color:var(--color-search)]",
          className,
        )}
      />
    );
  }

  // Defensive — keeps the gallery valid if the media list shrinks
  // out from under the current index (e.g. on revalidation).
  const safeIndex = Math.min(activeIndex, media.length - 1);
  const active = media[safeIndex];
  const hasThumbs = media.length > 1;

  return (
    <div
      className={cn(
        "grid gap-3",
        hasThumbs ? "grid-cols-[64px_1fr]" : "grid-cols-1",
        className,
      )}
    >
      {hasThumbs && (
        <GalleryThumbs
          media={media}
          activeIndex={safeIndex}
          onSelect={setActiveIndex}
          title={title}
        />
      )}
      <GalleryMain
        media={media}
        activeIndex={safeIndex}
        title={title}
        onPrev={
          hasThumbs && safeIndex > 0
            ? () => setActiveIndex(safeIndex - 1)
            : undefined
        }
        onNext={
          hasThumbs && safeIndex < media.length - 1
            ? () => setActiveIndex(safeIndex + 1)
            : undefined
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main viewer                                                          */
/* ------------------------------------------------------------------ */

/**
 * Main viewer — same visual language as `<ProductCardMedia>`:
 *
 *   - Media items are stacked absolutely inside an
 *     `overflow-hidden` square. The active item sits at
 *     `opacity-100`, every other at `opacity-0`, with a 300ms
 *     ease-out opacity transition. Navigation reads as a clean
 *     crossfade rather than a slide.
 *   - The container carries a `group/media` named group so the
 *     active image / video can pick up the same
 *     `group-hover/media:scale-[1.03]` zoom the product card uses
 *     on hover. Reusing the exact classes keeps the hover feel
 *     identical between the card and the PDP hero.
 *
 *     ┌────── viewport ──────┐
 *     │ ┌──────────────────┐ │
 *     │ │ active (opacity1)│ │  ← all items stacked at inset-0
 *     │ │ (others opacity0)│ │  ← only the active one is visible
 *     │ └──────────────────┘ │
 *     └──────────────────────┘
 *
 * Video handling: every `<video>` stays mounted so navigation
 * doesn't trigger reloads or poster flashes. An effect drives
 * `play()` / `pause()` imperatively whenever `activeIndex`
 * changes, and resets `currentTime` on the deactivating video so
 * the next visit starts from frame zero.
 *
 * LCP: only the first image gets `priority`; the rest fall back
 * to Next/Image's default lazy loading. Because everything sits
 * at the same coordinates, additional images do download up
 * front, but they're typically a handful per product and the
 * trade is instant crossfades with no re-fetch on step.
 */
function GalleryMain({
  media,
  activeIndex,
  title,
  onPrev,
  onNext,
}: {
  media: ReadonlyArray<ProductMedia>;
  activeIndex: number;
  title: string;
  /** Undefined when there's no previous media to step to. */
  onPrev?: () => void;
  /** Undefined when there's no next media to step to. */
  onNext?: () => void;
}) {
  /* One ref slot per media item. Re-allocated each render via the
   * inline callback so a shrinking media list (e.g. revalidation)
   * doesn't leave stale entries behind. */
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === activeIndex) {
        // `.play()` returns a Promise that rejects when autoplay
        // is blocked (mobile Safari with low-power mode, etc.).
        // Swallowing the rejection avoids an unhandled promise
        // warning; the video stays paused and the user can hit
        // play on the controls.
        video.play().catch(() => {});
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [activeIndex]);

  return (
    <div
      className={cn(
        "group/media relative aspect-square overflow-hidden rounded-2xl",
        "bg-[color:var(--color-search)]",
      )}
    >
      {media.map((item, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={item.id}
            aria-hidden={!isActive}
            className={cn(
              "absolute inset-0 transition-opacity duration-300 ease-out",
              isActive ? "opacity-100" : "opacity-0",
            )}
          >
            {item.kind === "image" ? (
              <Image
                src={item.preview.url}
                alt={item.preview.altText ?? title}
                width={item.preview.width}
                height={item.preview.height}
                priority={i === 0}
                sizes="(min-width: 768px) 45vw, 100vw"
                className={cn(
                  "h-full w-full object-cover",
                  "transition-transform duration-300 ease-out",
                  "group-hover/media:scale-[1.03]",
                )}
              />
            ) : (
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                poster={item.preview.url}
                muted
                loop
                playsInline
                controls
                preload="metadata"
                className={cn(
                  "h-full w-full object-cover",
                  "transition-transform duration-300 ease-out",
                  "group-hover/media:scale-[1.03]",
                )}
              >
                {item.videoSources?.map((src) => (
                  <source key={src.url} src={src.url} type={src.mimeType} />
                ))}
              </video>
            )}
          </div>
        );
      })}

      {onPrev && <ViewerNavButton direction="prev" onClick={onPrev} />}
      {onNext && <ViewerNavButton direction="next" onClick={onNext} />}
    </div>
  );
}

function ViewerNavButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous media" : "Next media"}
      className={cn(
        MEDIA_OVERLAY_BUBBLE_CLASSES,
        "absolute top-1/2 -translate-y-1/2",
        direction === "prev" ? "left-3" : "right-3",
      )}
    >
      <SmoothCaretIcon
        className={cn(
          "h-3.5 w-3.5",
          direction === "prev" ? "rotate-90" : "-rotate-90",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Thumbnail rail                                                        */
/* ------------------------------------------------------------------ */

function GalleryThumbs({
  media,
  activeIndex,
  onSelect,
  title,
}: {
  media: ReadonlyArray<ProductMedia>;
  activeIndex: number;
  onSelect: (index: number) => void;
  title: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /* When the active thumb falls outside the viewport (e.g. the
   * shopper steps through via the main viewer's prev / next
   * buttons), nudge the rail so the thumb is in view. `nearest`
   * so a thumb already visible isn't moved. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const thumb = el.children[activeIndex] as HTMLElement | undefined;
    thumb?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Product media"
      className={cn(
        "flex min-h-0 flex-col gap-2 overflow-y-auto",
        // Hide native scrollbars — wheel / touch / trackpad
        // scrolling still works, just without the chrome bar.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {media.map((item, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(i)}
            /* Hover-to-preview — legacy storefront idiom. Lets a
             *  shopper scan the full gallery with no clicks.
             *  Touch devices ignore `mouseenter` and fall back to
             *  tap (which fires `onClick`). */
            onMouseEnter={() => onSelect(i)}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg",
              "border-2 transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[color:var(--color-ink)] focus-visible:ring-offset-2",
              isActive
                ? "border-[color:var(--color-ink)]"
                : "border-[color:var(--color-border-strong)] hover:border-[color:var(--color-ink)]",
            )}
          >
            <Image
              src={item.preview.url}
              alt={item.preview.altText ?? title}
              width={item.preview.width}
              height={item.preview.height}
              sizes="64px"
              className="h-full w-full object-cover"
            />
            {item.kind === "video" && (
              <span
                aria-hidden
                className={
                  "absolute inset-0 flex items-center justify-center " +
                  "bg-black/30 text-white"
                }
              >
                <PlayIcon className="h-4 w-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
