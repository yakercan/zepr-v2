"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MediaLightbox,
  type LightboxMediaItem,
} from "@/components/products/media-lightbox";
import { PlayBadgeIcon, SmoothCaretIcon } from "@/components/ui/icons";
import { useActiveVideoControl } from "@/lib/hooks/use-active-video-control";
import { useCrossfade } from "@/lib/hooks/use-crossfade";
import {
  crossfadeLayerClasses,
  MEDIA_HOVER_ZOOM_CLASSES,
  MEDIA_OVERLAY_BUBBLE_CLASSES,
  MEDIA_STAGE_CLASSES,
} from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/types/product";

/* The image's hover-zoom inherits a 300ms cadence from
 * `MEDIA_HOVER_ZOOM_CLASSES` (tuned for product cards). The PDP
 * runs a snappier 200ms to match the layer crossfade so the two
 * motions read as one; tailwind-merge collapses the duplicate
 * `duration-*` to the latter value. */
const MEDIA_DURATION_CLASS = "duration-200";

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
  /** Optional external nudge — when this index changes, the
   *  gallery navigates to it through the same crossfade path
   *  internal navigation uses. PDP wires this to the variant
   *  picker so picking "Color: Blue" jumps the gallery to the
   *  blue colourway's photo (when Shopify attached one). Also
   *  seeds the initial active index, so on first paint the
   *  gallery already shows the right variant's image — no
   *  visible jump animation on mount. */
  syncedIndex?: number;
}

export function ProductGallery({
  media,
  title,
  className,
  syncedIndex,
}: ProductGalleryProps) {
  /* Crossfade state — shared with the lightbox via the same
   * `useCrossfade` hook so both surfaces feel identical when
   * stepping through media. */
  const { activeIndex, outgoingIndex, navigate } = useCrossfade(
    syncedIndex ?? 0,
  );

  /* Mirror of the last `syncedIndex` we've reacted to. Pairs with
   * the render-time change detector below to drive external
   * navigation without a useEffect — React's recommended pattern
   * for deriving state from props. */
  const [lastSyncedIndex, setLastSyncedIndex] = useState(syncedIndex);

  /* Render-time prop sync — when an external nudge arrives, mirror
   * it into local state and crossfade to the new index. Equivalent
   * to a useEffect with a guard, but without the extra commit cycle
   * (and without the React 19 setState-in-effect lint). `navigate`
   * is a no-op when the index is already current, so it's safe to
   * call unconditionally. */
  if (syncedIndex !== lastSyncedIndex) {
    setLastSyncedIndex(syncedIndex);
    if (syncedIndex != null) navigate(syncedIndex);
  }

  /* Lightbox plumbing — `lightboxIndex` is `null` when closed, a
   * numeric index when open. The lightbox itself manages
   * navigation; we just seed `initialIndex` and forward the
   * close. Items are memoised so the lightbox sees a stable
   * payload across re-renders. Hooks live ABOVE the empty-state
   * early return below so they aren't conditionally called. */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxItems = useMemo<LightboxMediaItem[]>(
    () => media.map((m) => toLightboxItem(m, title)),
    [media, title],
  );
  const openLightbox = useCallback(
    (index: number) => setLightboxIndex(index),
    [],
  );
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

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
          onSelect={navigate}
          title={title}
        />
      )}
      <GalleryMain
        media={media}
        activeIndex={safeIndex}
        outgoingIndex={outgoingIndex}
        title={title}
        onPrev={
          hasThumbs && safeIndex > 0
            ? () => navigate(safeIndex - 1)
            : undefined
        }
        onNext={
          hasThumbs && safeIndex < media.length - 1
            ? () => navigate(safeIndex + 1)
            : undefined
        }
        onImageClick={openLightbox}
      />

      <MediaLightbox
        media={lightboxItems}
        open={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={closeLightbox}
      />
    </div>
  );
}

/* Adapter — `ProductMedia` shape → the lightbox's generic
 * `LightboxMediaItem` shape. Images drop their dimensions
 * (the lightbox lets the browser size them); videos pass their
 * full source list + the preview frame as a poster. */
function toLightboxItem(m: ProductMedia, title: string): LightboxMediaItem {
  const alt = m.preview.altText ?? title;
  if (m.kind === "image") return { kind: "image", url: m.preview.url, alt };
  return {
    kind: "video",
    sources: m.videoSources ?? [],
    poster: m.preview.url,
    alt,
  };
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
 *     │ │ active   z-10    │ │  ← fades 0 → 100 on activation
 *     │ │ outgoing z-0     │ │  ← stays at 100 for the transition
 *     │ │ other   z--10    │ │  ← held at 0 (covered)
 *     │ └──────────────────┘ │
 *     └──────────────────────┘
 *
 * Why an outgoing layer: a naive opacity crossfade leaks the
 * parent backdrop at midpoint (both layers semi-transparent over
 * `--color-search`), which reads as a brief flash. Pinning the
 * previously-active layer at full opacity directly under the
 * incoming one keeps the viewport opaque end-to-end, so the
 * transition fades cleanly from frame A to frame B.
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
  outgoingIndex,
  title,
  onPrev,
  onNext,
  onImageClick,
}: {
  media: ReadonlyArray<ProductMedia>;
  activeIndex: number;
  /** Index of the previously-active layer to keep painted at full
   *  opacity for the duration of the crossfade. `null` outside of
   *  a transition. */
  outgoingIndex: number | null;
  title: string;
  /** Undefined when there's no previous media to step to. */
  onPrev?: () => void;
  /** Undefined when there's no next media to step to. */
  onNext?: () => void;
  /** Fires when the user clicks the active *image* layer. The
   *  PDP wires this to open the shared `<MediaLightbox>`. Only
   *  images opt in — videos keep their native controls (clicks
   *  there toggle play/pause, which would conflict with a zoom
   *  intent). */
  onImageClick?: (index: number) => void;
}) {
  /* One ref slot per video item, populated by an inline callback
   * on each `<video>`. Imperative play/pause + currentTime reset
   * lives in the shared `useActiveVideoControl` hook — same
   * behaviour as the lightbox. */
  const videoRefs = useActiveVideoControl(activeIndex);

  return (
    <div className={cn(MEDIA_STAGE_CLASSES, "rounded-2xl")}>
      {media.map((item, i) => {
        const isActive = i === activeIndex;
        const isOutgoing = !isActive && i === outgoingIndex;
        return (
          <div
            key={item.id}
            aria-hidden={!isActive}
            className={crossfadeLayerClasses(isActive, isOutgoing)}
          >
            {item.kind === "image" ? (
              <Image
                src={item.preview.url}
                alt={item.preview.altText ?? title}
                width={item.preview.width}
                height={item.preview.height}
                priority={i === 0}
                sizes="(min-width: 768px) 45vw, 100vw"
                /* Only the active layer reacts to clicks. The
                 * other layers sit at `-z-10` so they can't be
                 * hit visually anyway, but skipping the handler
                 * altogether means we don't even pretend to be
                 * clickable from an accessibility-tree
                 * perspective when we aren't. */
                onClick={
                  isActive && onImageClick
                    ? () => onImageClick(i)
                    : undefined
                }
                className={cn(
                  MEDIA_HOVER_ZOOM_CLASSES,
                  MEDIA_DURATION_CLASS,
                  isActive && onImageClick ? "cursor-zoom-in" : "",
                )}
              />
            ) : (
              /* Videos here render with native controls, so they
               * intentionally skip the hover-zoom that images get —
               * scaling the element would also scale the browser
               * controls bar, which fights the user's click target.
               * Sizing utility only. */
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
                className="h-full w-full object-cover"
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
        /* Sits above every media layer (active is z-10) so the
         * controls stay clickable through the crossfade. */
        "absolute top-1/2 z-20 -translate-y-1/2",
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

  /* Height plumbing: outer `relative` wrapper is a zero-intrinsic-
   * height cell that grid stretches to the row's height (driven
   * by the main viewer's `aspect-square`). The inner scroll
   * container is `absolute inset-0` so it fills that height
   * without ever contributing back to the row's intrinsic size.
   * Net effect: the rail can never push the row taller than the
   * media square — it just scrolls when the thumbs would overflow. */
  return (
    <div className="relative">
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Product media"
      className={cn(
        "absolute inset-0 flex flex-col gap-2 overflow-y-auto",
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
              /* Legacy storefront's video-thumbnail badge: dark scrim
               * + filled white disc with a soft-cornered triangle
               * cut out (the triangle inherits the scrim's tint
               * through the cutout, which is why the icon sits over
               * `bg-black/30`). */
              <span
                aria-hidden
                className={
                  "absolute inset-0 flex items-center justify-center " +
                  "bg-black/30 text-white"
                }
              >
                <PlayBadgeIcon className="h-8 w-8" />
              </span>
            )}
          </button>
        );
      })}
    </div>
    </div>
  );
}
