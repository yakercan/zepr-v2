"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useIsTouch } from "@/components/device/device-provider";
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

/* How far the finger has to travel horizontally before we treat
 * a touch gesture as a navigation swipe rather than a tap. 50px
 * is the same threshold native iOS / Material galleries settle
 * on — small enough that a deliberate swipe registers without
 * effort, big enough that an accidental scroll-induced drift
 * doesn't trigger a page-through. */
const SWIPE_THRESHOLD_PX = 50;

/**
 * Single-pointer horizontal swipe detector for the gallery's
 * main viewer. Returns handler props the caller spreads onto
 * the media-stage container; on mobile a touch swipe fires
 * `onLeft` (= next) or `onRight` (= previous), exactly the same
 * way native carousel galleries paginate.
 *
 * Why the explicit `enabled` gate (rather than just no-op'ing
 * inside the handlers): we still want the handlers attached on
 * the desktop branch's render path so React can re-use the same
 * element across renders, but we want them functionally inert
 * — desktop pages through with the on-canvas prev / next
 * bubbles and the keyboard arrows handled by the lightbox; a
 * mouse drag here would compete with the cursor-zoom intent.
 *
 * Three details that keep this from misfiring:
 *
 *   1. **Touch only** (`pointerType === "touch"`). Desktop
 *      pointer drags reach this same code path when the dev-
 *      tools "device" emulator is engaged; the guard keeps
 *      ambient mouse input from page-throughing the gallery.
 *   2. **Horizontal dominance** (`|dx| > |dy|`). A secondary
 *      guard behind the stage's `touch-action: pan-y` (which
 *      already stops the page from scrolling during a
 *      horizontal swipe): a vertical scroll cancels the pointer
 *      before pointerup, but if the browser ever hands us a
 *      diagonal gesture, the dominance check still keeps a
 *      mostly-vertical drag from registering as a page-through.
 *   3. **Video opt-out.** `<video controls>` has its own
 *      horizontal-drag gestures (seekbar scrub); intercepting
 *      pointer events there would steal the seek interaction.
 *      `target.closest("video")` skips the swipe whenever the
 *      gesture starts inside any video subtree.
 *
 * After a real swipe fires we set `swipedRef.current` and catch
 * the upcoming click event in capture phase — otherwise the
 * `click` synthesized at touch end (when `dx` is small enough
 * for the browser to also fire a click after a slow drag) would
 * open the lightbox on top of the page we just navigated to.
 */
function usePointerSwipe({
  onLeft,
  onRight,
  enabled,
}: {
  onLeft: (() => void) | undefined;
  onRight: (() => void) | undefined;
  enabled: boolean;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType !== "touch") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("video")) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      swipedRef.current = false;
    },
    [enabled],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start) return;
      startRef.current = null;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      swipedRef.current = true;
      if (dx < 0) onLeft?.();
      else onRight?.();
    },
    [onLeft, onRight],
  );

  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!swipedRef.current) return;
    swipedRef.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture };
}

/**
 * Product media gallery — images + videos with a thumbnail rail
 * whose orientation flips by device.
 *
 * Reusable across surfaces:
 *
 *   - PDP left column        (full-width, large main view)
 *   - Variant-pick modal     (smaller main view, same UX)
 *
 * Width-fluid — adapts to whatever container gives it space.
 *
 * **Desktop** — rail sits as a vertical column to the left of the
 * main viewer, flush against its top edge:
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
 * **Mobile** — rail sits as a horizontal row *below* the main
 * viewer. Vertical thumbs on a 375px viewport would steal width
 * from the main image (already the most important pixel on the
 * page); below-viewer thumbs let the main image claim the full
 * column width and turn the rail into a one-finger horizontal
 * scrub:
 *
 *     ┌─[<]──────────[>]──────┐
 *     │                       │
 *     │   main viewer         │
 *     │   (image | video)     │
 *     │                       │
 *     └───────────────────────┘
 *     ┌──┐┌──┐┌──┐┌──┐
 *     │t1││t2││t3││t4│ ←──→ overflow-x-auto
 *     └──┘└──┘└──┘└──┘
 *
 * Rail overflow on either axis: native scroll (wheel + touch +
 * trackpad). Scrollbar chrome is hidden so the rail reads cleanly
 * against the page; the visual hint that more thumbs exist is the
 * last thumbnail being clipped at the rail's edge.
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
 *   - **Touch swipe on the main viewer** (mobile only) — drag
 *     left to step to the next media, drag right for the
 *     previous. Threshold + horizontal-dominance gates keep
 *     the gesture from misfiring on a slow vertical scroll.
 *     See `usePointerSwipe` at the top of this file.
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
          /* Mirror the live gallery's width cap so the empty state
           * occupies the same footprint as a populated gallery. */
          "mx-auto w-full max-w-[640px]",
          "aspect-square rounded-2xl bg-[color:var(--color-surface-muted)]",
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
        "gap-3",
        /* Cap the gallery so it never balloons on a wide PDP column or
         * a large modal — a square viewer past this width just wastes
         * vertical space. `mx-auto` centres the leftover room (in the
         * two-column desktop track and in the single-column mobile /
         * modal panel alike); phones sit under the cap so it's a no-op
         * there. Tune the one number to taste — keep the loading
         * skeletons (gallery empty-state below + modal `BodySkeleton`)
         * in sync so the panel doesn't reshape when media lands. */
        "mx-auto w-full max-w-[640px]",
        /* Layout switches between mobile and desktop when thumbs exist:
         *
         *   - **Desktop** (`lg-desktop`: ≥1024px + a desktop pointer) —
         *     2-column grid (`64px` rail + `1fr` main). JSX order =
         *     layout order, thumbs land in col 1, main in col 2.
         *   - **Mobile** (base: phones, narrow windows, and touch
         *     tablets at any width) — column flex with
         *     `flex-col-reverse`. Thumbs render first in JSX (so the
         *     desktop grid places them on the left); the reverse flex
         *     flips that order so the main viewer sits on top and the
         *     thumb rail drops to the bottom — no duplicated JSX
         *     branches, just a one-class flip.
         *
         * Single-media products skip the rail entirely and stay on a
         * 1-col grid everywhere. */
        hasThumbs
          ? "flex flex-col-reverse lg-desktop:grid lg-desktop:grid-cols-[64px_1fr]"
          : "grid grid-cols-1",
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
 * `--color-surface-muted`), which reads as a brief flash. Pinning the
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

  /* Mobile-only touch swipe navigation. Left swipe = next media,
   * right swipe = previous; `onPrev`/`onNext` are already
   * undefined at the gallery's edges, so swiping past the first /
   * last item is automatically a no-op without an extra branch
   * here. */
  const isTouch = useIsTouch();
  const swipeProps = usePointerSwipe({
    onLeft: onNext,
    onRight: onPrev,
    enabled: isTouch,
  });

  return (
    <div
      className={cn(
        MEDIA_STAGE_CLASSES,
        "rounded-2xl",
        /* Scroll-axis arbitration for the swipe.
         *
         * `touch-action: pan-y` hands the browser exactly one job on
         * this surface — vertical panning — and reserves the
         * horizontal axis for us. The compositor then locks each
         * gesture to a single axis up front: a horizontal-dominant
         * swipe scrolls *nothing* (so the page can't drift
         * vertically mid-swipe) and its pointer stream flows to
         * `usePointerSwipe`; a vertical-dominant drag scrolls the
         * page natively and fires `pointercancel`, which the hook
         * treats as "not a swipe". This is the declarative,
         * compositor-driven fix every modern carousel (Embla,
         * Swiper) uses — no non-passive `touchmove` listener, no
         * per-frame `preventDefault`, so it stays jank-free. Scoped
         * to `touch:` (coarse-pointer devices) because it only governs
         * touch input and a pointer never swipes here. */
        "touch:[touch-action:pan-y]",
      )}
      {...swipeProps}
    >
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
  /* Hover-to-preview is desktop-only. On mobile a synthetic
   * mouseenter from a tap would race the click handler — both fire
   * `onSelect(i)`, which is harmless functionally but kicks off two
   * crossfade animations in a row. Cleaner to bind `onMouseEnter`
   * only when we're sure there's a real pointer in play. */
  const isTouch = useIsTouch();

  /* When the active thumb falls outside the viewport (e.g. the
   * shopper steps through via the main viewer's prev / next
   * buttons), nudge the rail so the thumb is in view. `nearest`
   * on *both* axes so it works for the desktop vertical rail and
   * the mobile horizontal rail without branching — the unused
   * axis is a no-op since `nearest` only scrolls when the element
   * is actually off-screen. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const thumb = el.children[activeIndex] as HTMLElement | undefined;
    thumb?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex]);

  /* Layout per mode:
   *
   *   - **Desktop** (`lg-desktop`) — outer `relative` is a
   *     zero-intrinsic-height cell that the grid row stretches to the
   *     main viewer's `aspect-square` height. The inner scroller is
   *     `absolute inset-0` so it fills that height without ever
   *     contributing back to the row's intrinsic size — the rail
   *     can never push the row taller than the media square.
   *   - **Mobile** (base) — outer stays `display: contents`, removing
   *     itself from layout entirely. The inner scroller then
   *     participates as a *direct flex child* of the parent
   *     gallery's `flex-col-reverse` layout: a normal horizontal
   *     row of thumbs sitting below the main viewer, with the
   *     parent column claiming its full width. No absolute
   *     positioning, no synthetic height plumbing. */
  return (
    <div className="contents lg-desktop:relative lg-desktop:block">
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Product media"
      className={cn(
        "flex gap-2",
        // Hide native scrollbars on either axis — wheel /
        // touch / trackpad scrolling still works without the
        // chrome bar.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Mobile (base): static, full-width horizontal scroller in
        // the parent column's bottom row.
        "overflow-x-auto",
        // Desktop: absolute-positioned vertical scroller inside the
        // outer `relative` cell (the 64px left rail).
        "lg-desktop:absolute lg-desktop:inset-0 lg-desktop:flex-col lg-desktop:overflow-y-auto",
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
             *  Skipped entirely on mobile so a tap can't fire both
             *  the synthetic mouseenter and the click in succession
             *  (which would queue back-to-back crossfades). */
            onMouseEnter={isTouch ? undefined : () => onSelect(i)}
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
