"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsCompact, useIsTouch } from "@/components/device/device-provider";
import {
  MediaLightbox,
  type LightboxMediaItem,
} from "@/components/products/media-lightbox";
import { PlayBadgeIcon, SmoothCaretIcon } from "@/components/ui/icons";
import { shopifyImageLoader } from "@/lib/shopify/image-loader";
import { useActiveVideoControl } from "@/lib/hooks/use-active-video-control";
import { useCrossfade } from "@/lib/hooks/use-crossfade";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import {
  MEDIA_OVERLAY_BUBBLE_CLASSES,
  MEDIA_STAGE_CLASSES,
} from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/types/product";

/* Runs before paint on the client (so a scroll reposition can't
 * flash a wrong frame), falls back to `useEffect` on the server to
 * skip React's "useLayoutEffect does nothing on the server"
 * warning. The carousel uses it to seat the rail on the active
 * slide the instant its loop clones mount. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
 *   - Prev / next arrows step in order and **wrap around** — prev
 *     from the first item loops to the last, next from the last to
 *     the first, so neither arrow is ever dead. Pointer devices
 *     only (a touch device pages by swipe); gated on hydration so
 *     they never enter a phone's DOM, and they fade in on desktop.
 *     See `ViewerNavButton`.
 *   - Stepping past the visible thumbs auto-scrolls the rail so
 *     the active thumb stays in view (`scrollIntoView`).
 *   - **Swipe the main viewer** (mobile only) — the viewer is a
 *     native scroll-snap carousel that **loops infinitely**: a full
 *     buffer copy of the slides on each side means a continued swipe
 *     always has real slides ahead and never stalls at an edge; the
 *     rail recenters invisibly once motion settles (see
 *     `<GalleryMain>`). The slide under the rail is tracked live
 *     (rAF, not on settle), so the thumb highlight + active video
 *     stay in lockstep with the finger.
 *
 * Implementation notes:
 *
 *   - `"use client"` — `useState`-driven active index. Tiny
 *     client island; everything else stays RSC.
 *   - First image gets `priority` so it counts as the LCP.
 *   - Main viewer media stays mounted across navigation; on
 *     desktop the visible item is selected via opacity (crossfade),
 *     on mobile it's the snapped carousel slide (see
 *     `<GalleryMain>`) — either way videos don't reload and posters
 *     don't flash on switch. On desktop the hover-zoom mirrors the
 *     product card's lean-in (`group-hover/media:scale-[1.03]`); the
 *     mobile carousel drops it (no hover on a swipe surface).
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
        onNavigate={navigate}
        /* Wrap-around: prev from the first item loops to the last,
         * next from the last loops to the first — so the arrows are
         * never dead and a shopper can keep paging in one direction
         * through the whole gallery. Modulo keeps it to one line each;
         * `+ length` guards the negative case before the `%`. */
        onPrev={
          hasThumbs
            ? () => navigate((safeIndex - 1 + media.length) % media.length)
            : undefined
        }
        onNext={
          hasThumbs ? () => navigate((safeIndex + 1) % media.length) : undefined
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
 * Main viewer — one set of media items rendered two ways from the
 * *same DOM*, with the slide classes (not a JS branch) deciding
 * which presentation a given viewport gets. This is deliberate:
 * the viewer is the LCP, so anything that swapped its structure
 * after hydration would flash the most important pixel on the
 * page. Responsive Tailwind variants keep the markup identical
 * server- and client-side; `useIsCompact` only governs the scroll
 * *behaviour* (the two effects below), never the layout.
 *
 * **Desktop** (`lg-desktop:`) — items are stacked absolutely
 * inside the `overflow-hidden` square and crossfaded by opacity,
 * the same visual language as `<ProductCardMedia>` (including the
 * `group-hover/media:scale-[1.03]` lean-in zoom, which is
 * desktop-only — the mobile carousel has no hover to drive it):
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
 * **Mobile** (base) — the same items become full-width in-flow
 * slides inside a horizontal **scroll-snap carousel**: swipe to
 * page through, with the browser owning momentum, snapping, and
 * axis arbitration (horizontal swipe scrolls the rail, vertical
 * swipe scrolls the page). Native scroll also distinguishes a tap
 * (opens the lightbox) from a drag (pages the rail) for free — no
 * pointer-gesture bookkeeping, and noticeably more elegant than a
 * JS-driven slide. The rail **loops infinitely** via a triple
 * buffer: a full, pixel-identical copy of the slides is rendered on
 * each side of the real run, so a continued swipe always has slides
 * ahead and never stalls at an edge (the failure mode of a single
 * edge clone, which dead-ends until a reposition fires). Once motion
 * settles, the rail jumps instantly — and invisibly, the copies
 * being identical — back onto the middle copy, restoring the buffer
 * for the next swipe. The copies mount only after hydration — SSR
 * ships the real slides at offset 0 so the first paint is the right
 * image, and a layout effect re-seats the scroll onto the middle
 * copy the instant they appear:
 *
 *     ┌──── slide n ────┬──── slide n+1 ──┄
 *     │                 │
 *     │   ◄ swipe ─────────────►           snap-mandatory
 *     │                 │
 *     └─────────────────┴─────────────────┄
 *
 * `activeIndex` is the single source of truth for both modes (it
 * drives the thumb highlight, arrow availability, lightbox seed,
 * and active-video playback). On mobile the two effects below keep
 * it in lockstep with the scroll position in both directions — see
 * each effect's comment for how they avoid fighting each other.
 *
 * Video handling: every `<video>` stays mounted so navigation
 * doesn't trigger reloads or poster flashes. An effect drives
 * `play()` / `pause()` imperatively whenever `activeIndex`
 * changes, and resets `currentTime` on the deactivating video so
 * the next visit starts from frame zero.
 *
 * LCP: only the first image gets `priority`; the rest fall back
 * to Next/Image's default lazy loading. Because everything sits in
 * one stack / rail, additional images do download up front, but
 * they're typically a handful per product and the trade is instant
 * crossfades / slides with no re-fetch on step.
 */
function GalleryMain({
  media,
  activeIndex,
  outgoingIndex,
  title,
  onNavigate,
  onPrev,
  onNext,
  onImageClick,
}: {
  media: ReadonlyArray<ProductMedia>;
  activeIndex: number;
  /** Index of the previously-active layer to keep painted at full
   *  opacity for the duration of the desktop crossfade. `null`
   *  outside of a transition (and irrelevant on the mobile
   *  carousel, where every slide sits at full opacity). */
  outgoingIndex: number | null;
  title: string;
  /** Sets the active index. The mobile carousel calls this when a
   *  swipe settles on a new slide; it's the same `navigate` the
   *  thumbs and arrows use, so every surface shares one source of
   *  truth. */
  onNavigate: (index: number) => void;
  /** Step to the previous media (wraps to the last). Undefined for
   *  a single-media gallery, where there's nothing to page. */
  onPrev?: () => void;
  /** Step to the next media (wraps to the first). Undefined for a
   *  single-media gallery, where there's nothing to page. */
  onNext?: () => void;
  /** Fires when the user clicks/taps a media *image*. The PDP
   *  wires this to open the shared `<MediaLightbox>`. Only images
   *  opt in — videos keep their native controls (clicks there
   *  toggle play/pause, which would conflict with a zoom intent). */
  onImageClick?: (index: number) => void;
}) {
  /* One ref slot per video item, populated by an inline callback
   * on each `<video>`. Imperative play/pause + currentTime reset
   * lives in the shared `useActiveVideoControl` hook — same
   * behaviour as the lightbox. */
  const videoRefs = useActiveVideoControl(activeIndex);

  /* Behaviour gate only — the markup is identical on both branches
   * (see the component doc). Governs whether the scroll-sync
   * effects below run; on desktop the inner track is
   * `display: contents` (zero-box), so even if they did run the
   * `clientWidth === 0` guards would no-op them. */
  const isCompact = useIsCompact();
  const hydrated = useHydrated();
  const trackRef = useRef<HTMLDivElement>(null);
  /* Tracks the slide we last seated on, so a programmatic jump knows
   * which image to dissolve *from*; `false` until the first seat so
   * the initial position (default or deep-linked variant) lands
   * without an on-load fade. */
  const prevIndexRef = useRef(activeIndex);
  const hasSeatedRef = useRef(false);
  /* Raised by the scroll handlers for the brief window a swipe is
   * mid-flight, so the alignment effect doesn't yank a rail the finger
   * is still moving. It's the *secondary* signal (position is primary)
   * and is dropped unconditionally on settle, so it can't linger and
   * swallow a later tap. */
  const scrollDrivenRef = useRef(false);
  /* Live mirror of `activeIndex` for the scroll handlers, whose
   * listeners are bound once (not per index, which would thrash them
   * every frame of a swipe). Lets them skip a redundant navigate when
   * the rail is already on the slide they'd report. Updated in the
   * layout effect below (refs mustn't be written during render); that
   * runs before paint, ahead of any scroll the user could trigger. */
  const activeIndexRef = useRef(activeIndex);
  /* The outgoing slide painted over the viewer during a no-slide
   * navigation (thumb tap, arrow, variant sync), fading out to
   * reveal the slide the rail has already jumped to — the carousel's
   * answer to the desktop crossfade. `null` outside a transition and
   * for swipes, which animate natively. */
  const [fadeFromIndex, setFadeFromIndex] = useState<number | null>(null);

  /* Infinite carousel ⇔ when the loop is live, the rail renders a
   * full copy of every slide on *each* side of the real run (a
   * triple buffer). A continued swipe always has real slides ahead,
   * so it never dead-ends against an edge; on settle the rail
   * recenters onto the middle copy with an invisible instant jump
   * (the copies are identical), restoring the buffer for the next
   * swipe. Gated on `hydrated` so SSR / first paint ships the real
   * slides at offset 0 (correct LCP); the copies — which shift the
   * real run one full width to the right — only mount once we can
   * immediately re-seat the scroll position (see the layout effect). */
  const n = media.length;
  const loop = hydrated && isCompact && n > 1;

  /* Carousel → state. Two jobs on one scroll listener:
   *
   *   1. **Live highlight** (rAF-throttled). Map the slide under the
   *      rail back to its real index (`dom % n`, since each real
   *      slide appears once per copy) and adopt it, so the thumbnail
   *      highlight + active video track the finger every frame
   *      instead of lagging until the scroll settles.
   *   2. **Recenter** (on settle). Once motion fully stops, jump
   *      instantly to the same slide in the *middle* copy. The copies
   *      are pixel-identical, so the jump is invisible — it just
   *      restores a full buffer on both sides so the next swipe again
   *      never reaches an edge. Done only on settle (never mid-scroll)
   *      so momentum is never interrupted. Fired off `scrollend` (the
   *      event built for "scroll fully settled, momentum + snap
   *      included"); engines without it fall back to an idle debounce.
   *
   * The live path raises `scrollDrivenRef` so the alignment effect
   * doesn't yank a rail the finger is still moving; the recenter drops
   * it again on settle so it can't linger and swallow a later tap. */
  useEffect(() => {
    if (!loop) return;
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const realIndexAt = (w: number) =>
      ((Math.round(track.scrollLeft / w) % n) + n) % n;
    const push = (real: number) => {
      if (real === activeIndexRef.current) return;
      scrollDrivenRef.current = true;
      onNavigate(real);
    };
    const recenter = () => {
      const w = track.clientWidth;
      if (w === 0) return;
      const real = realIndexAt(w);
      if (Math.round(track.scrollLeft / w) !== n + real) {
        track.scrollTo({ left: (n + real) * w, behavior: "auto" });
      }
      push(real);
      /* Motion has fully settled, so the swipe is over: drop the flag
       * unconditionally. It only ever guards the brief mid-scroll
       * window, and leaving it raised here is what let a stray scroll
       * swallow the *next* tap (the "first thumb tap does nothing,
       * second works" bug). */
      scrollDrivenRef.current = false;
    };
    const hasScrollEnd = "onscrollend" in window;
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          const w = track.clientWidth;
          if (w === 0) return;
          push(realIndexAt(w));
        });
      }
      if (!hasScrollEnd) {
        if (settle) clearTimeout(settle);
        settle = setTimeout(recenter, 80);
      }
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    if (hasScrollEnd) track.addEventListener("scrollend", recenter);
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (hasScrollEnd) track.removeEventListener("scrollend", recenter);
      if (raf) cancelAnimationFrame(raf);
      if (settle) clearTimeout(settle);
    };
  }, [loop, n, onNavigate]);

  /* State → carousel. Seat the rail on `activeIndex` in the middle
   * copy (real slide `i` lives at DOM offset `(n + i) * w`) for a
   * non-scroll navigation — thumb tap, prev/next arrow, variant-image
   * sync — and once, before paint, the instant the copies mount
   * (hence a layout effect: it keeps the leading copy from flashing
   * for a frame). The jump is instant so a thumb tap doesn't scrub
   * the highlight through every slide it passes. A swipe is left
   * alone: the rail already sits on the slide (primary check) or the
   * swipe is still mid-flight (`scrollDrivenRef`), so it's never
   * yanked back under the finger. */
  useIsomorphicLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
    if (!loop) {
      prevIndexRef.current = activeIndex;
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    const w = track.clientWidth;
    if (w === 0) return;
    const from = prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    const target = (n + activeIndex) * w;
    /* First seat after the copies mount → land on the middle copy
     * without a dissolve (the initial / deep-linked image shouldn't
     * fade in on load). */
    if (!hasSeatedRef.current) {
      hasSeatedRef.current = true;
      track.scrollTo({ left: target, behavior: "auto" });
      return;
    }
    /* Rail already shows this slide (a settled swipe, the recenter,
     * or a no-op change) → leave it, and never dissolve a native
     * landing. This position check is the primary signal, so a stale
     * flag can't suppress a real tap. */
    if (((Math.round(track.scrollLeft / w) % n) + n) % n === activeIndex) {
      return;
    }
    /* Still mid-swipe (scroll hasn't settled, the rail sits a frame
     * ahead of the index) — the recenter will land it; seating now
     * would yank the rail out from under the finger. */
    if (scrollDrivenRef.current) return;
    /* A genuine programmatic move (thumb tap / arrow / variant sync) —
     * seat onto the middle copy and dissolve from the slide we leave. */
    if (from !== activeIndex) setFadeFromIndex(from);
    track.scrollTo({ left: target, behavior: "auto" });
  }, [loop, n, activeIndex]);

  return (
    <div
      className={cn(
        MEDIA_STAGE_CLASSES,
        "rounded-2xl",
        /* Frame the viewer with the same 2px strong border the
         * thumbnails rest at, so the gallery reads as one bordered
         * family rather than a borderless image above bordered chips. */
        "border-2 border-[color:var(--color-border-strong)]",
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          /* Mobile: a horizontal scroll-snap carousel filling the
           * stage. `overscroll-x-contain` stops a swipe past the
           * last slide from triggering the browser's back-gesture;
           * the scrollbar chrome is hidden so the rail reads clean. */
          "flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          /* Desktop: dissolve the track (`display: contents`) so the
           * slides become *direct* crossfade layers of the stage —
           * absolutely positioned against it, opacity-swapped. The
           * flex/scroll/snap utilities above are inert once the box
           * is gone. */
          "lg-desktop:contents",
        )}
      >
        {/* Leading buffer — a full copy of every slide before the real
         * run, so a swipe off the first item rolls straight into the
         * last (and several more) with no edge. Carousel-only; hidden
         * on desktop, where the real slides crossfade instead. */}
        {loop &&
          media.map((item) => (
            <CarouselClone key={`lead-${item.id}`} item={item} />
          ))}
        {media.map((item, i) => {
          const isActive = i === activeIndex;
          const isOutgoing = !isActive && i === outgoingIndex;
          return (
            <div
              key={item.id}
              aria-hidden={!isActive}
              className={cn(
                /* Mobile slide: one viewport-width in-flow item that
                 * snaps to the rail's start edge. */
                "relative h-full w-full shrink-0 snap-start",
                /* Desktop: lift it out of flow into the crossfade
                 * stack. Active fades in on top (z-10); the outgoing
                 * layer holds at full opacity directly below (z-0) so
                 * the backdrop can't bleed through mid-fade; the rest
                 * sit hidden and tucked away (-z-10). 200ms matches
                 * `CROSSFADE_DURATION_MS`. */
                "lg-desktop:absolute lg-desktop:inset-0 lg-desktop:transition-opacity lg-desktop:duration-200 lg-desktop:ease-out",
                isActive
                  ? "lg-desktop:z-10 lg-desktop:opacity-100"
                  : isOutgoing
                    ? "lg-desktop:z-0 lg-desktop:opacity-100"
                    : "lg-desktop:-z-10 lg-desktop:opacity-0",
              )}
            >
              {item.kind === "image" ? (
              <Image
                loader={shopifyImageLoader}
                src={item.preview.url}
                alt={item.preview.altText ?? title}
                width={item.preview.width}
                height={item.preview.height}
                priority={i === 0}
                sizes="(min-width: 768px) 45vw, 100vw"
                /* Tap/click → lightbox at this item. Desktop stacks
                 * the inactive layers behind the active one (-z-10),
                 * so only the visible image is ever hit; on mobile
                 * the snapped slide is the one under the finger. */
                onClick={onImageClick ? () => onImageClick(i) : undefined}
                className={cn(
                  "h-full w-full object-cover",
                  /* Hover-zoom is a desktop-crossfade flourish only —
                   * the same lean-in the product card uses, scoped to
                   * `lg-desktop`. The mobile carousel skips it: a swipe
                   * surface has no hover, and on a narrow desktop
                   * window a scale on a snapping slide reads as jitter.
                   * 200ms matches the crossfade (CROSSFADE_DURATION_MS). */
                  "lg-desktop:transition-transform lg-desktop:duration-200 lg-desktop:ease-out lg-desktop:group-hover/media:scale-[1.03]",
                  onImageClick ? "cursor-zoom-in" : "",
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
        {/* Trailing buffer — mirror of the leading copy, so a swipe
         * off the last item rolls into the first, second, … with no
         * edge to stall against. */}
        {loop &&
          media.map((item) => (
            <CarouselClone key={`trail-${item.id}`} item={item} />
          ))}
      </div>

      {/* No-slide dissolve. The rail jumps instantly on a thumb tap /
       * arrow / variant sync (so the active highlight never scrubs);
       * this paints the outgoing slide over the viewer and fades it
       * out to reveal the new one underneath — the carousel's take on
       * the desktop crossfade. Reuses the app-wide `animate-fade-out`
       * token (same one the lightbox close rides) — single source for
       * the keyframe, duration, and easing. Keyed by the transition so
       * each navigation restarts the fade clean; `pointer-events-none`
       * lets a swipe/tap mid-fade fall through to the rail; desktop
       * runs its own crossfade so this is hidden there. */}
      {fadeFromIndex != null && (
        <div
          key={`fade-${fadeFromIndex}-${activeIndex}`}
          aria-hidden
          onAnimationEnd={() => setFadeFromIndex(null)}
          className="animate-fade-out pointer-events-none absolute inset-0 z-10 lg-desktop:hidden"
        >
          <Image
            loader={shopifyImageLoader}
            src={media[fadeFromIndex].preview.url}
            alt=""
            width={media[fadeFromIndex].preview.width}
            height={media[fadeFromIndex].preview.height}
            sizes="100vw"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Prev / next arrows — pointer devices only, decided in pure
       * CSS (`desktop:` on the button), so no JS / hydration gate to
       * flash on phones or lag in on desktop. On a full desktop they
       * paint with the page; on a narrow pointer window (the compact
       * carousel) they ease in; a touch device never gets them and
       * pages by swipe (see `ViewerNavButton`). Siblings of the scroll
       * track (not children) so they stay pinned over the rail. */}
      {onPrev && <ViewerNavButton direction="prev" onClick={onPrev} />}
      {onNext && <ViewerNavButton direction="next" onClick={onNext} />}
    </div>
  );
}

/* One slide of an infinite-carousel buffer copy — a decorative,
 * identical twin of a real slide rendered in the leading / trailing
 * run so a swipe always has slides ahead and never dead-ends; the
 * rail recenters onto the real run once motion settles. Image-only
 * (no `<video>` or click target): a buffer slide is only ever on
 * screen in passing between settles, so a static poster suffices,
 * and skipping a second `<video>` keeps the active-video control
 * mapping one-to-one with the real slides. `lg-desktop:hidden` keeps
 * the buffer out of the desktop crossfade stack. */
function CarouselClone({ item }: { item: ProductMedia }) {
  return (
    <div
      aria-hidden
      className="relative h-full w-full shrink-0 snap-start lg-desktop:hidden"
    >
      <Image
        loader={shopifyImageLoader}
        src={item.preview.url}
        alt=""
        width={item.preview.width}
        height={item.preview.height}
        sizes="100vw"
        className="h-full w-full object-cover"
      />
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
        /* Pointer devices only, in pure CSS: hidden by default
         * (overriding the bubble's `flex`), shown as `flex` on the
         * `desktop:` input variant. No hydration wait, no touch flash. */
        "hidden desktop:flex",
        /* Ease in on the compact carousel (device detection is the only
         * tell there), but appear instantly on a full desktop, where
         * the layout already implies a pointer — no reason to wait out
         * a fade. */
        "animate-fade-in lg-desktop:animate-none",
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
              loader={shopifyImageLoader}
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
