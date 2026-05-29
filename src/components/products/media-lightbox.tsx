"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type AnimationEvent as ReactAnimationEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { CloseIcon, SmoothCaretIcon } from "@/components/ui/icons";
import { useActiveVideoControl } from "@/lib/hooks/use-active-video-control";
import { useCrossfade } from "@/lib/hooks/use-crossfade";
import {
  useBodyScrollLock,
  useEscapeClose,
} from "@/lib/hooks/use-overlay-behaviors";
import { crossfadeLayerClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Full-viewport media lightbox.
 *
 * One primitive, two surfaces:
 *
 *   - Product gallery — click the main image, lightbox opens at
 *     that media index, arrows walk through the entire gallery
 *     (images + videos).
 *   - Review media grid — click a thumb, lightbox opens at that
 *     photo, arrows walk through the review's attachments.
 *
 * Two behaviours stay in lockstep with the gallery so the
 * shopper feels one continuous surface, not two:
 *
 *   1. **Crossfade between items** via the shared `useCrossfade`
 *      hook + the `crossfadeLayerClasses` helper in `"fade"` mode.
 *      Symmetric — outgoing fades 100 → 0 concurrently with the
 *      incoming's 0 → 100, against the overlay's `bg-black/85`
 *      backdrop. Different from the gallery's `"hold"` mode on
 *      purpose: lightbox media is `object-contain` at natural
 *      aspect, so two adjacent layers can have different bounding
 *      boxes (landscape → portrait); holding the outgoing at full
 *      opacity would leave its "extra extent" sticking out behind
 *      the incoming for the full duration, then snapping to 0 at
 *      release. Fading concurrently eliminates that tail at the
 *      cost of a brief midpoint where both layers are
 *      semi-transparent — invisible against the black backdrop.
 *   2. **Imperative video play/pause** via the shared
 *      `useActiveVideoControl` hook — every video stays mounted
 *      across navigation so there's no reload or poster flash,
 *      and the hook drives `play()` / `pause()` whenever
 *      `activeIndex` changes. Pass `active=false` while the
 *      overlay is closed so background tabs / hidden state can't
 *      keep a video playing on the way out.
 *
 * No hover-scale here on purpose: the lightbox already fills the
 * viewport at `object-contain`, so the gallery's "lean in to see
 * detail" hover affordance has nothing to add — the media is
 * already shown at maximum size.
 *
 * Click-to-close model:
 *
 *     ┌──────── viewport ────────┐
 *     │                ┌───┐     │  ← click anywhere here
 *     │ ┌◀┐  ┌─────┐  │ ✕ │     │     closes (bubbles to
 *     │ └─┘  │media│  └───┘     │     overlay's onClick).
 *     │      │     │  ┌◀┐  ┌▶┐  │
 *     │      └─────┘  └─┘  └─┘  │  ← arrows + close +
 *     │                         │     counter pill all
 *     │       n / total         │     stopPropagation.
 *     └─────────────────────────┘
 *
 * The canvas is sized to the viewport (`90vw × 85vh`) and hosts
 * all the stacked layers; only the actual `<img>` / `<video>`
 * inside each layer calls `stopPropagation`, so empty space
 * around a portrait photo bubbles up through the layer's
 * non-handling div and hits the overlay's `onClose`.
 *
 * Z-index `--z-lightbox` (210) — the topmost overlay tier. It can
 * be launched from inside a modal *or* a Vaul sheet (the product
 * modal's gallery on a compact viewport), so it has to clear the
 * sheet tiers (170 / elevated 190), not just the base modals.
 */

export type LightboxMediaItem =
  | {
      kind: "image";
      url: string;
      alt: string;
    }
  | {
      kind: "video";
      /** Source list — let the browser pick a playable codec.
       *  Single-source uploads (review videos) pass a one-entry
       *  array; multi-source product videos pass the full list. */
      sources: ReadonlyArray<{ url: string; mimeType: string }>;
      /** Optional poster frame shown before play. */
      poster?: string;
      alt: string;
    };

export interface MediaLightboxProps {
  media: ReadonlyArray<LightboxMediaItem>;
  open: boolean;
  /** Index to show on open. Changes while `open` jump-fade to
   *  the new item (parent clicks a different thumb without
   *  closing). Re-opens reset the index without a fade. */
  initialIndex?: number;
  onClose: () => void;
}

export function MediaLightbox({
  media,
  open,
  initialIndex = 0,
  onClose,
}: MediaLightboxProps) {
  /* Mount lifecycle — keep DOM mounted through the exit
   * animation, unmount after onAnimationEnd. Matches <Modal>. */
  const [mounted, setMounted] = useState<boolean>(open);
  const [lastOpen, setLastOpen] = useState<boolean>(open);
  const [lastInitialIndex, setLastInitialIndex] =
    useState<number>(initialIndex);

  const { activeIndex, outgoingIndex, navigate, setIndex } =
    useCrossfade(initialIndex);

  /* Rising edge — mount + jump (no fade) to the seeded index. */
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setMounted(true);
      setIndex(initialIndex);
      setLastInitialIndex(initialIndex);
    }
  }

  /* Parent nudge while already open (clicking a different thumb)
   * — crossfade to the new index instead of jumping. */
  if (open && initialIndex !== lastInitialIndex) {
    setLastInitialIndex(initialIndex);
    navigate(initialIndex);
  }

  const active = mounted && open;
  useBodyScrollLock(active);
  useEscapeClose(active, onClose);

  const total = media.length;

  const stepBy = useCallback(
    (delta: number) => {
      if (total < 2) return;
      navigate((((activeIndex + delta) % total) + total) % total);
    },
    [activeIndex, navigate, total],
  );

  /* Keyboard ← / → navigation while showing. `window`-scoped so
   * it fires regardless of where focus sits inside the overlay. */
  useEffect(() => {
    if (!active || total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepBy(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stepBy, total]);

  /* Imperative video play/pause — same hook as `<ProductGallery>`.
   * Keeps every video element mounted so navigation never triggers
   * a reload or poster flash; the hook just toggles play/pause +
   * resets `currentTime` on the deactivating video. Gated by
   * `active` so videos pause as soon as the overlay starts to
   * close, rather than playing through the fade-out. */
  const videoRefs = useActiveVideoControl(activeIndex, active);

  const handleAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!open) setMounted(false);
    },
    [open],
  );

  const stop = useCallback(
    (e: ReactMouseEvent) => e.stopPropagation(),
    [],
  );

  const isClient = useIsClient();
  if (!isClient || !mounted || total === 0) return null;

  const canStep = total > 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={onClose}
      /* When the lightbox is launched from inside a Vaul sheet (the
       * product modal on compact viewports), Vaul's `modal` mode pins
       * `pointer-events: none` on `<body>` and re-enables it only on
       * the drawer content — so this portal-to-`body` overlay, though
       * painted on top via `--z-lightbox`, is pointer-transparent and
       * every tap falls through to the drawer/overlay behind it. Two
       * fixes restore interaction without touching Vaul's config:
       *   1. `pointer-events-auto` (below) re-opts this subtree in, so
       *      the close/nav buttons receive their clicks again.
       *   2. Swallow `pointerdown` here so it never reaches Radix's
       *      document-level outside-press listener — otherwise the
       *      first tap on the lightbox reads as "outside the drawer"
       *      and dismisses the sheet underneath us. */
      onPointerDown={(e) => e.stopPropagation()}
      onAnimationEnd={handleAnimationEnd}
      className={cn(
        "pointer-events-auto fixed inset-0 z-[var(--z-lightbox)] flex items-center justify-center bg-black/85 p-4",
        /* Pure opacity fade — the lightbox already covers the
         * whole viewport, so the modal pair's scale + translate
         * would read as the canvas rubber-banding in from a
         * corner. The shared `animate-fade-{in,out}` keyframes
         * keep the cadence in sync with everything else. */
        open ? "animate-fade-in" : "animate-fade-out",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className={cn(
          "absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full",
          "bg-black/60 text-white transition-colors hover:bg-black/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        )}
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      {/* Canvas — viewport-fit container that hosts the stacked
       *  media layers. Sized once, layers are absolute inside.
       *
       *  Below `md` the arrows drop to the bottom of the frame, so the
       *  canvas can run the full `90vw`. From `md` up the arrows sit on
       *  the vertical mid-edges (`left-4`/`right-4`, 3rem wide → they
       *  span 1–4rem from each edge), so we inset the canvas to a 5rem
       *  side gutter (`100vw - 10rem`). That leaves a clean ~1rem gap
       *  between each arrow and the media instead of the arrows
       *  overlapping the picture on narrower desktop widths. */}
      <div className="relative h-[85vh] w-[90vw] md:w-[calc(100vw-10rem)]">
        {media.map((item, i) => {
          const isActive = i === activeIndex;
          const isOutgoing = !isActive && i === outgoingIndex;
          return (
            <div
              key={i}
              aria-hidden={!isActive}
              className={cn(
                /* `"fade"` mode — symmetric crossfade so the
                 * outgoing layer can't leave a tail when the next
                 * media has a smaller bounding box (landscape →
                 * portrait, etc.). See helper docs for the
                 * trade-off vs the gallery's `"hold"` mode. */
                crossfadeLayerClasses(isActive, isOutgoing, "fade"),
                /* Centre the media inside the canvas so portrait
                 * and landscape both sit flush; the layer wrapper
                 * is the full canvas, the media itself stays at
                 * natural aspect via `object-contain`. */
                "flex items-center justify-center",
              )}
            >
              <LightboxItem
                item={item}
                isActive={isActive}
                videoRef={(el) => {
                  videoRefs.current[i] = el;
                }}
                onStop={stop}
              />
            </div>
          );
        })}
      </div>

      {canStep && (
        <>
          <NavButton
            side="left"
            onClick={(e) => {
              e.stopPropagation();
              stepBy(-1);
            }}
          />
          <NavButton
            side="right"
            onClick={(e) => {
              e.stopPropagation();
              stepBy(1);
            }}
          />
          <div
            onClick={stop}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white"
          >
            {activeIndex + 1} / {total}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/* ---------- internal ---------- */

function LightboxItem({
  item,
  isActive,
  videoRef,
  onStop,
}: {
  item: LightboxMediaItem;
  isActive: boolean;
  videoRef: (el: HTMLVideoElement | null) => void;
  onStop: (e: ReactMouseEvent) => void;
}) {
  if (item.kind === "image") {
    return (
      // Plain <img> — user-uploaded photos arrive at unknown
      // aspect ratios and Next/Image needs explicit dimensions
      // or a sized parent to avoid layout shift. `object-contain`
      // + dual-axis caps fit portrait and landscape both. No
      // hover-zoom: the photo is already at its largest useful
      // size, scaling further would just push it off the canvas.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={item.alt}
        onClick={onStop}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    );
  }
  return (
    <video
      ref={videoRef}
      controls
      // Only the active video opts into autoplay; outgoing /
      // background ones are paused by the imperative effect
      // anyway, but keeping autoplay off here avoids a brief
      // play() rejection logspam on inactive layers.
      autoPlay={isActive}
      playsInline
      poster={item.poster}
      onClick={onStop}
      aria-label={item.alt}
      className="max-h-full max-w-full rounded-lg"
    >
      {item.sources.map((src) => (
        <source key={src.url} src={src.url} type={src.mimeType} />
      ))}
    </video>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous media" : "Next media"}
      className={cn(
        "absolute z-20",
        /* Below `md`, drop the arrows to the bottom corners of the
         * frame rather than the vertical mid-edges: easier
         * one-thumb reach on a phone and it leaves the centre of
         * the picture unobstructed. They flank the bottom-centre
         * counter pill, so the three read as one bottom control
         * row. `md+` restores the classic mid-height side arrows. */
        "bottom-4 md:top-1/2 md:bottom-auto md:-translate-y-1/2",
        side === "left" ? "left-4" : "right-4",
        "inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white",
        "transition-colors hover:bg-black/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
      )}
    >
      <SmoothCaretIcon
        className={cn(
          "h-4 w-4",
          side === "left" ? "rotate-90" : "-rotate-90",
        )}
      />
    </button>
  );
}

/* SSR-safe `mounted` flag — matches `<Backdrop>` / `<Modal>`. */
const subscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
