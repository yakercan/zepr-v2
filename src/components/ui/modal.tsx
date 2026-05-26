"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEvent as ReactAnimationEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Backdrop } from "@/components/ui/backdrop";
import { CloseIcon } from "@/components/ui/icons";
import {
  useBodyScrollLock,
  useEscapeClose,
} from "@/lib/hooks/use-overlay-behaviors";
import { cn } from "@/lib/utils";

/**
 * Centered modal shell.
 *
 * One component handles every full-screen overlay that isn't the
 * cart drawer: variant pickers, confirm dialogs, image previews,
 * future "added to cart" toasts, etc. Three priorities behind the
 * design:
 *
 *   1. **Stackable.** A modal can open another modal (e.g. a confirm
 *      dialog *inside* the variant picker). The `layer` prop picks
 *      the z-index tier so each level sits cleanly above the last.
 *      The tiers sit well above the header (z-50) and the cart
 *      drawer (z-[60]/[70]) so all three can coexist.
 *   2. **Animated in *and* out.** Closing instantly is jarring —
 *      the panel rides a 150ms fade-out + tiny scale-down while the
 *      backdrop opacity-fades in sync, then the whole DOM tree
 *      unmounts. Panel runs CSS keyframes, backdrop runs an opacity
 *      transition (driven by the shared `<Backdrop>`). Both are GPU-
 *      cheap and React never has to RAF-dance state.
 *   3. **Drop-in primitive.** Body scroll lock, Escape close, and
 *      backdrop-click close are all wired internally via the shared
 *      `useBodyScrollLock` / `useEscapeClose` hooks. Call sites only
 *      manage `open` and `onClose`.
 *
 * **Backdrop choice — `<Backdrop coverHeader>`.** The same primitive
 * the cart drawer uses for "above the header" overlay (the inverse
 * of the dropdown backdrop, which sits *behind* the header so the
 * sticky bar stays crisp). Modals are full-page takeovers, so the
 * header fades with the rest of the page underneath. Reusing the
 * shared `<Backdrop>` means a single source of truth for that
 * `coverHeader` look across the app.
 *
 * Stacking model (per layer):
 *
 *   - `layer="base"`    — backdrop z-[100], panel z-[110]
 *   - `layer="preview"` — backdrop z-[120], panel z-[130]
 *   - `layer="confirm"` — backdrop z-[140], panel z-[150]
 *
 * The pairs sit one tier apart so a preview backdrop renders
 * *above* its parent base panel (dimming it), and the preview
 * panel sits above that backdrop. Each modal's panel z-index goes
 * on the panel wrapper itself (not on an outer dialog div) —
 * `position: fixed` on the wrapper creates its stacking context
 * directly, no extra layer of nesting needed.
 *
 * Why the panel wrapper carries the z-index explicitly: page
 * content using `position: relative; z-index: 1` (e.g.
 * `.icon-bubble > *`) propagates to the root stacking context. If
 * the modal's outer fixed div had `z-index: auto`, a `z:1` glyph
 * would paint *above* it. Carrying the layer's z-index on the
 * panel wrapper places the whole modal at the correct level in
 * the root context.
 *
 * Mount lifecycle:
 *
 *   - `open=true` → mount immediately, run "in" animation.
 *   - `open=false` → keep mounted, swap to "out" animation, unmount
 *     when the panel's animation ends. Listening on the panel (not
 *     the backdrop) guarantees the panel finishes its exit even if
 *     the backdrop's opacity transition has different timing.
 *   - We listen for `onAnimationEnd` on the panel ONLY when
 *     `e.target === e.currentTarget`; child animations (e.g. shimmer
 *     on a loading state inside the modal) won't trigger unmount.
 */
const LAYER_Z = {
  base: { backdrop: "z-[100]", panel: "z-[110]" },
  preview: { backdrop: "z-[120]", panel: "z-[130]" },
  confirm: { backdrop: "z-[140]", panel: "z-[150]" },
} as const;

/**
 * Easing + duration for the panel's content-driven size animation.
 * Same cubic-bezier curve the enter / exit keyframes use so a
 * height shrink that fires alongside a close fade reads as one
 * coordinated motion rather than two competing eases.
 */
const MODAL_SIZE_TRANSITION =
  "height 200ms cubic-bezier(0.16, 1, 0.3, 1)";

export type ModalLayer = keyof typeof LAYER_Z;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional title — when set, renders a stuck-to-top header with
   *  the title on the left and the close button on the right. When
   *  omitted, only the absolute-positioned close button is rendered
   *  in the panel's top-right corner. */
  title?: string;
  /** Stacking tier. Defaults to `"base"`. Use `"preview"` when this
   *  modal is opened from inside another modal so it visually sits
   *  on top instead of beside its parent. */
  layer?: ModalLayer;
  /** Tailwind sizing on the panel — most call sites pass a width
   *  cap like `max-w-md` or `max-w-2xl`. Layout / padding stays the
   *  responsibility of the children so a single Modal can host both
   *  compact dialogs and large pickers. */
  className?: string;
  /** Hide the close affordance entirely. Use for confirm-style
   *  modals where the user MUST click an action. */
  hideClose?: boolean;
  /** ARIA label override. Defaults to `title` when present, else
   *  `"Dialog"`. */
  ariaLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
  title,
  layer = "base",
  className,
  hideClose = false,
  ariaLabel,
}: ModalProps) {
  /* DOM-presence flag. Goes true on open, stays true through the
   * exit animation, drops to false after `onAnimationEnd` fires. */
  const [mounted, setMounted] = useState<boolean>(open);
  /* Track the previous `open` to detect rising edges and re-mount. */
  const [lastOpen, setLastOpen] = useState<boolean>(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setMounted(true);
  }

  /* Wire the shared overlay behaviours only while we're actually
   * visible. `mounted && open` filters out the exit-animation window
   * — we don't want Escape or scroll-lock to trigger anything during
   * the close transition. */
  const active = mounted && open;
  useBodyScrollLock(active);
  useEscapeClose(active, onClose);

  /* Auto-focus the first focusable child on open so keyboard users
   * land inside the dialog instead of behind the backdrop. */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], [tabindex]:not([tabindex='-1']), input, textarea, select",
    );
    first?.focus({ preventScroll: true });
  }, [active]);

  /* Size animation — when the panel's content reshapes (skeleton
   * → real data, error → recovery, picker state changes), the
   * height tween between sizes rather than snapping.
   *
   * Approach: own the panel's explicit `height` via inline style,
   * driven by a `ResizeObserver` watching the panel's children.
   * Every measurement temporarily releases `height: auto` to read
   * the natural size, then writes the clamped target back. The
   * first measurement applies without transition so the modal
   * doesn't pop from 0 to its initial size; subsequent changes
   * animate through `transition: height` with the same easing
   * curve as the enter / exit keyframes.
   *
   * Loop guard: a `measuring` flag short-circuits the
   * observer for two frames after each measurement, so the
   * observer's own resize echoes (from our `height: auto` swap)
   * don't trigger a new pass before the layout has settled.
   *
   * Why useLayoutEffect: the first measurement must run after
   * the panel has been laid out by the browser but before paint,
   * otherwise the modal flashes at its CSS-default size for one
   * frame on open. */
  useLayoutEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    let lastApplied: number | null = null;
    let measuring = false;

    const measure = () => {
      if (measuring) return;
      measuring = true;

      /* Read the panel's natural content height by temporarily
       * releasing the explicit height. `void offsetHeight` is a
       * sync-layout boundary — the browser computes layout
       * immediately, no paint, no React commit. */
      panel.style.transition = "none";
      panel.style.height = "auto";
      void panel.offsetHeight;
      const naturalH = panel.offsetHeight;

      /* Clamp to the same margin the wrapper enforces. Reads
       * `window.innerHeight` rather than parsing the CSS `dvh`
       * value so mobile viewport changes (URL bar collapse, etc.)
       * are caught by the resize listener below. */
      const maxH = window.innerHeight - 64; // matches `calc(100dvh - 4rem)`
      const target = Math.min(naturalH, maxH);

      if (lastApplied === null) {
        /* First measurement after mount/reopen — snap to target
         * with the transition disabled so we don't animate from
         * the panel's CSS-default opening size. The enter
         * keyframe is doing the opacity + scale flourish; the
         * explicit-height swap rides under it invisibly. */
        panel.style.height = `${target}px`;
        void panel.offsetHeight;
        panel.style.transition = MODAL_SIZE_TRANSITION;
      } else if (lastApplied !== target) {
        /* Subsequent change — restore the previous height first
         * so CSS has a valid numeric "from" value, then defer
         * the target set into the next frame so the transition
         * actually picks up the change rather than collapsing
         * both writes into one frame. */
        panel.style.height = `${lastApplied}px`;
        void panel.offsetHeight;
        panel.style.transition = MODAL_SIZE_TRANSITION;
        requestAnimationFrame(() => {
          panel.style.height = `${target}px`;
        });
      } else {
        /* No change — restore last height + transition and bail.
         * Happens when the resize observer fires from our own
         * `height: auto` swap, or when the resize listener fires
         * but the content's natural size is unchanged. */
        panel.style.height = `${lastApplied}px`;
        panel.style.transition = MODAL_SIZE_TRANSITION;
      }

      lastApplied = target;

      /* Release the loop guard after the next two frames so any
       * observer echoes from our measurement settle before we
       * accept another pass. Two RAFs gives the browser a full
       * layout + paint to land before re-arming. */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measuring = false;
        });
      });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    /* Observe each direct child rather than the panel itself —
     * observing the panel would create a feedback loop with our
     * height writes. Children re-mount when content swaps
     * (e.g. skeleton → real), so we also re-observe whenever the
     * panel's child list changes. */
    const observeChildren = () => {
      ro.disconnect();
      for (const child of Array.from(panel.children)) {
        ro.observe(child);
      }
    };
    observeChildren();
    const mo = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    mo.observe(panel, { childList: true });

    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
      /* Intentionally not resetting `style.height` / `transition`
       * here — the panel stays mounted through the close
       * keyframe (which animates opacity + transform), and
       * resetting height mid-animation would visually jump the
       * panel back to `auto` before the fade completes. The
       * style attribute is cleared naturally when the panel
       * unmounts via `setMounted(false)` in `handlePanelAnimationEnd`. */
    };
  }, [active]);

  const handlePanelAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!open) setMounted(false);
    },
    [open],
  );

  /* React portals render into a different DOM subtree, but
   * synthetic events still bubble up through the *React* tree to
   * the component that mounted the modal. The shared `<Backdrop>`
   * handles its own stopPropagation internally; we still need to
   * stop click + mousedown on the panel wrapper so clicks landing
   * on the panel chrome (header / close button / inside the
   * content) can't bubble out to whatever rendered the modal
   * (e.g. a `<Link>` around a product card). */
  const stop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  /* SSR portal target. The whole modal is purely interactive — no
   * point in rendering on the server. */
  const isClient = useIsClient();
  if (!isClient || !mounted) return null;

  const zPair = LAYER_Z[layer];

  return (
    <>
      {/* Shared coverHeader backdrop — same primitive the cart
          drawer uses. Per-layer z-index passed via `className` so
          tailwind-merge replaces the component's default `z-[60]`
          with our higher modal tier. */}
      <Backdrop
        open={open}
        coverHeader
        onClick={onClose}
        className={zPair.backdrop}
      />

      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel ?? title ?? "Dialog"}
          onClick={stop}
          onMouseDown={stop}
          className={cn(
            // `pointer-events-none` on the centring wrapper so a
            // click on the empty space around the panel passes
            // through to the backdrop below. The panel itself
            // re-enables pointer events on itself.
            "pointer-events-none fixed inset-0 flex items-center justify-center p-4",
            zPair.panel,
          )}
        >
          <div
            ref={panelRef}
            onAnimationEnd={handlePanelAnimationEnd}
            className={cn(
              "pointer-events-auto relative flex w-full max-w-md flex-col overflow-hidden",
              /* Height cap — sits 2rem inside the wrapper's `p-4`
               *  (1rem each side) for a comfortable safe-area
               *  gutter that doesn't make the panel feel
               *  edge-anchored. `dvh` tracks the visible viewport
               *  area on mobile, so the cap shrinks when iOS
               *  shows its address bar instead of letting the
               *  panel slide beneath it. Pairs with the
               *  layout-effect that owns the actual `height`
               *  inline style and animates it between content-
               *  driven sizes. */
              "max-h-[calc(100dvh_-_4rem)]",
              "rounded-2xl border border-[color:var(--color-border)]",
              "bg-[color:var(--color-surface)] shadow-2xl",
              open ? "animate-modal-in" : "animate-modal-out",
              className,
            )}
          >
            {title ? (
              <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
                <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
                  {title}
                </h2>
                {!hideClose && <ModalCloseButton onClick={onClose} />}
              </div>
            ) : (
              !hideClose && (
                <ModalCloseButton
                  onClick={onClose}
                  className="absolute right-3 top-3 z-20"
                />
              )
            )}

            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ModalCloseButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink-muted)]",
        "transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-ink)]",
        className,
      )}
    >
      <CloseIcon className="h-5 w-5" />
    </button>
  );
}

/* SSR-safe `mounted` flag (matches `backdrop.tsx`). */
const subscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
