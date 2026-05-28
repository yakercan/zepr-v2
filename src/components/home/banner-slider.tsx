"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent,
} from "react";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/ui/icons";
import { HOME_BANNERS, type HomeBanner } from "@/config/banners";
import { MEDIA_OVERLAY_BUBBLE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Homepage banner slider.
 *
 * Built with a tiny native pattern instead of a carousel library —
 * we don't need multi-slide-per-view or any of the heavier Embla /
 * Swiper features here. Three slides, autoplay, a soft loop, desktop
 * prev/play-pause/next controls, and a lightweight touch-swipe on
 * mobile (where those controls are hidden). That's it.
 *
 * Responsive art direction: below `md` each slide shows the taller
 * mobile crop (`mobileImage`, `aspect-[1920/800]`); from `md` up it's
 * the wide desktop strip (`image`, `aspect-[1920/300]`). The swap is
 * a `<picture>` `<source>` so only the matching asset is fetched.
 *
 * How the loop works (the "duplicate-slide" pattern):
 *
 *   The DOM renders   [clone-of-last, …slides, clone-of-first]
 *   The transform     translateX(-virtualIdx * 100%)
 *
 *   - virtualIdx 0           → clone-of-last (off-screen, used only
 *                              when wrapping backwards)
 *   - virtualIdx 1..N        → real slides 0..N-1
 *   - virtualIdx N+1         → clone-of-first (off-screen, used only
 *                              when wrapping forwards)
 *
 *   Advancing past the real last animates *into* the clone-of-first
 *   (so the user sees a continuous forward motion), and on
 *   `transitionend` we silently snap virtualIdx back to 1 (the real
 *   first) with `transition: none` for one frame. The user never
 *   sees the rewind.
 *
 * The setState calls during the snap all live inside event handlers
 * (`onTransitionEnd`, `setInterval` callbacks), so React 19's
 * `set-state-in-effect` lint rule stays happy.
 */
const AUTOPLAY_INTERVAL_MS = 6000;
const SLIDE_TRANSITION_MS = 500;
/** Minimum horizontal travel (px) for a touch drag to count as a
 *  slide-changing swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

export function BannerSlider({
  banners = HOME_BANNERS,
}: {
  banners?: readonly HomeBanner[];
}) {
  const slideCount = banners.length;
  const hasLoop = slideCount > 1;

  // `1` lines up with the real first slide because we prepend the
  // clone-of-last. For a single-banner display the slider degrades to
  // a static image — see the early return below.
  const [virtualIdx, setVirtualIdx] = useState(1);
  const [animating, setAnimating] = useState(true);

  // Two pause sources kept separate so the manual play/pause button
  // is sticky (one click and autoplay stays off) while hover pause
  // is transient (resumes the moment the cursor leaves).
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const paused = hoverPaused || manualPaused;

  const advance = useCallback(() => {
    setAnimating(true);
    setVirtualIdx((v) => v + 1);
  }, []);

  const retreat = useCallback(() => {
    setAnimating(true);
    setVirtualIdx((v) => v - 1);
  }, []);

  /** Re-enables the CSS transition on the next paint after a
   *  no-transition snap. Two rAFs because the first one fires
   *  before layout has applied the new transform; the second
   *  guarantees the snap is committed before the transition
   *  re-attaches. */
  const reArmTransition = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimating(true));
    });
  };

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "transform") return;
    if (virtualIdx >= slideCount + 1) {
      // Slid forward into clone-of-first → snap to real first.
      setAnimating(false);
      setVirtualIdx(1);
      reArmTransition();
    } else if (virtualIdx <= 0) {
      // Slid backward into clone-of-last → snap to real last.
      setAnimating(false);
      setVirtualIdx(slideCount);
      reArmTransition();
    }
  };

  // Touch-swipe navigation (mobile). The desktop controls are hidden
  // below `md`, so swipe is the only way to move between slides on a
  // phone. We snap to the neighbouring slide on release (rather than
  // finger-following the transform) which reuses the existing
  // advance/retreat + loop machinery and keeps the gesture cheap.
  //
  //   - Touch pointers only — a mouse drag on desktop shouldn't move
  //     slides (desktop has the arrow controls for that).
  //   - Horizontal dominance guard (`|dx| > |dy|`) so a vertical page
  //     scroll started on the banner isn't mistaken for a swipe.
  //   - `onClickCapture` swallows the click the browser synthesises
  //     after a drag, so a swipe never also navigates the slide's
  //     `<Link>`.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch") return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    swipedRef.current = false;
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      swipedRef.current = true;
      if (dx < 0) advance();
      else retreat();
    },
    [advance, retreat],
  );

  const onPointerCancel = useCallback(() => {
    swipeStartRef.current = null;
  }, []);

  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!swipedRef.current) return;
    swipedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Autoplay tick. `paused` invalidates the interval immediately so a
  // hover/click doesn't have to wait for the in-flight tick to fire.
  // The interval callback uses `advance` from closure — which is
  // stable (no deps that change with virtualIdx), so the interval
  // doesn't churn on every render.
  useEffect(() => {
    if (!hasLoop || paused) return;
    const id = window.setInterval(advance, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, hasLoop, advance]);

  // Convert virtualIdx back to a real banner index for dots / aria.
  const realIdx =
    virtualIdx === 0
      ? slideCount - 1
      : virtualIdx === slideCount + 1
        ? 0
        : virtualIdx - 1;

  // Degenerate case — single banner. No need for loop machinery.
  if (slideCount === 1) {
    const only = banners[0];
    return (
      <div className="relative overflow-hidden rounded-xl">
        <BannerSlide banner={only} eager />
      </div>
    );
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotional banners"
      // `touch-pan-y` keeps vertical page scroll native while letting
      // our horizontal swipe handlers own left/right gestures.
      className="relative touch-pan-y overflow-hidden rounded-xl"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
    >
      <div
        className="flex"
        style={{
          transform: `translateX(-${virtualIdx * 100}%)`,
          transition: animating
            ? `transform ${SLIDE_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
            : "none",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Clone of last — needed for seamless backwards wrap. */}
        <BannerSlide banner={banners[slideCount - 1]} eager={false} hidden />
        {banners.map((b, i) => (
          <BannerSlide
            key={b.id}
            banner={b}
            eager={i === 0}
            active={i === realIdx}
          />
        ))}
        {/* Clone of first — needed for seamless forwards wrap. */}
        <BannerSlide banner={banners[0]} eager={false} hidden />
      </div>

      <Controls
        paused={manualPaused}
        onPrev={retreat}
        onNext={advance}
        onTogglePause={() => setManualPaused((p) => !p)}
      />

      <Dots count={slideCount} active={realIdx} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Slide                                                               */
/* ------------------------------------------------------------------ */

function BannerSlide({
  banner,
  eager,
  active,
  hidden,
}: {
  banner: HomeBanner;
  eager: boolean;
  active?: boolean;
  /** Clones are duplicates of real slides — keep them out of the a11y
   *  tree so SR users hear each banner exactly once. */
  hidden?: boolean;
}) {
  const inner = (
    // Aspect ratio is responsive: the mobile asset is a taller
    // 1920×800 crop (more vertical room for phone-width art), the
    // desktop asset the wide 1920×300 strip. The `<source>` below
    // swaps the actual file at the same `md` boundary so the browser
    // fetches only the crop that matches the current breakpoint.
    <div className="relative aspect-[1920/800] w-full overflow-hidden bg-[color:var(--color-surface-muted)] md:aspect-[1920/300]">
      <ShimmerImage
        src={banner.image}
        sources={
          banner.mobileImage
            ? [{ media: "(max-width: 767.98px)", srcSet: banner.mobileImage }]
            : undefined
        }
        alt={banner.alt}
        loading={eager ? "eager" : "lazy"}
        wrapperClassName="block h-full w-full"
        className="h-full w-full object-cover"
        skeletonRounded="none"
      />
    </div>
  );

  return (
    <div
      className="min-w-full flex-[0_0_100%]"
      role="group"
      aria-roledescription="slide"
      aria-hidden={hidden || !active}
      aria-label={banner.alt || undefined}
    >
      {banner.href ? (
        <Link
          href={banner.href}
          // Slim hover lift — same nudge the original zepr banner
          // uses, kept subtle so the autoplay motion doesn't compete
          // with the hover state.
          className="block transition-transform duration-300 ease-out hover:scale-[1.005]"
          tabIndex={hidden ? -1 : undefined}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls + dots                                                     */
/* ------------------------------------------------------------------ */

function Controls({
  paused,
  onPrev,
  onNext,
  onTogglePause,
}: {
  paused: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePause: () => void;
}) {
  return (
    // Hidden below `md`: on mobile the slider is swipe-driven, so the
    // arrow / play-pause cluster is dropped for a cleaner, chrome-free
    // banner. Desktop keeps the full controls (no swipe there).
    <div className="absolute right-3 top-3 z-10 hidden items-center gap-1 md:flex">
      <ControlButton aria-label="Previous slide" onClick={onPrev}>
        <ChevronLeftIcon className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        aria-label={paused ? "Play slideshow" : "Pause slideshow"}
        onClick={onTogglePause}
      >
        {paused ? (
          <PlayIcon className="h-5 w-5" />
        ) : (
          <PauseIcon className="h-4 w-4" />
        )}
      </ControlButton>
      <ControlButton aria-label="Next slide" onClick={onNext}>
        <ChevronRightIcon className="h-4 w-4" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(MEDIA_OVERLAY_BUBBLE_CLASSES, className)}
      {...props}
    >
      {children}
    </button>
  );
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full bg-white/60 transition-all duration-300",
            i === active ? "w-6 bg-white" : "w-1.5",
          )}
        />
      ))}
    </div>
  );
}
