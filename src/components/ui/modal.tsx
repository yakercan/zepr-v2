"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEvent as ReactAnimationEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
 *      The tiers leave room for the existing cart drawer
 *      (z-[60]/[70]) to coexist when needed.
 *   2. **Animated in *and* out.** Closing instantly is jarring —
 *      the panel rides a 150ms fade-out + tiny scale-down while the
 *      backdrop fades, then the whole DOM tree unmounts. Driven by
 *      CSS keyframes (`animate-modal-in`, `animate-modal-out`,
 *      `animate-fade-in`, `animate-fade-out`) so the GPU does the
 *      work and React never has to RAF-dance state changes.
 *   3. **Drop-in primitive.** Body scroll lock, Escape close, and
 *      backdrop-click close are all wired internally via the shared
 *      `useBodyScrollLock` / `useEscapeClose` hooks. Call sites only
 *      manage `open` and `onClose`.
 *
 * Stacking model:
 *
 *   - `layer="base"`    — z-[100]/[110]  (the typical case)
 *   - `layer="preview"` — z-[120]/[130]  (modal opened *from* a modal)
 *   - `layer="confirm"` — z-[140]/[150]  (final confirm dialog on top)
 *
 * The pairs (backdrop / panel) sit one tier apart so panels of the
 * same layer can't accidentally render below a sibling's backdrop.
 *
 * Mount lifecycle:
 *
 *   - `open=true` → mount immediately, run "in" animation.
 *   - `open=false` → keep mounted, swap to "out" animation, unmount
 *     when the panel's animation ends. Listening on the panel (not
 *     the backdrop) guarantees the panel finishes its exit even if
 *     the backdrop's animation has different timing.
 *   - We listen for `onAnimationEnd` on the panel ONLY when
 *     `e.target === e.currentTarget`; child animations (e.g. shimmer
 *     on a loading state inside the modal) won't trigger unmount.
 */
const LAYER_Z = {
  base: { backdrop: "z-[100]", panel: "z-[110]" },
  preview: { backdrop: "z-[120]", panel: "z-[130]" },
  confirm: { backdrop: "z-[140]", panel: "z-[150]" },
} as const;

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

  const handlePanelAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!open) setMounted(false);
    },
    [open],
  );

  /* SSR portal target. The whole modal is purely interactive — no
   * point in rendering on the server. */
  const isClient = useIsClient();
  if (!isClient || !mounted) return null;

  const zPair = LAYER_Z[layer];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title ?? "Dialog"}
      className="fixed inset-0"
    >
      {/* Backdrop — owns its own click handler. `onMouseDown` (not
          `onClick`) so a long-press / drag inside the panel that
          ends outside doesn't accidentally trigger a close. */}
      <div
        aria-hidden
        onMouseDown={onClose}
        className={cn(
          "fixed inset-0 bg-black/40",
          zPair.backdrop,
          open ? "animate-fade-in" : "animate-fade-out",
        )}
      />

      {/* Centered flex wrapper. The wrapper is `pointer-events-none`
          so clicks pass through to the backdrop below; the inner
          panel re-enables pointer events on itself only. This keeps
          backdrop-click semantics intact even though the wrapper
          sits *over* the backdrop in the DOM. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 flex items-center justify-center p-4",
          zPair.panel,
        )}
      >
        <div
          ref={panelRef}
          onAnimationEnd={handlePanelAnimationEnd}
          className={cn(
            "pointer-events-auto relative flex w-full max-w-md flex-col overflow-hidden",
            "rounded-2xl border border-[color:var(--color-border)]",
            "bg-[color:var(--color-surface)] shadow-2xl",
            open ? "animate-modal-in" : "animate-modal-out",
            className,
          )}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
              <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
                {title}
              </h2>
              {!hideClose && <ModalCloseButton onClick={onClose} />}
            </div>
          ) : (
            !hideClose && (
              <ModalCloseButton
                onClick={onClose}
                className="absolute right-3 top-3"
              />
            )
          )}

          {children}
        </div>
      </div>
    </div>,
    document.body,
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
        "transition-colors hover:bg-[color:var(--color-search)] hover:text-[color:var(--color-ink)]",
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
