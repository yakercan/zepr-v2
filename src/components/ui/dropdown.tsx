"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useIsTouch } from "@/components/device/device-provider";
import { cn } from "@/lib/utils";
import { Backdrop } from "@/components/ui/backdrop";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";

/**
 * Hover intent timings, ms.
 *
 * Symmetric 80ms — short enough that the dropdown feels glued to the
 * cursor on both open and close. The gap between summary and panel is
 * eliminated by `padding-top` on the panel container (it sits flush
 * under the summary inside the `<details>` element), so we don't need
 * a long close grace period to cover travel.
 */
const HOVER_OPEN_DELAY_MS = 80;
const HOVER_CLOSE_DELAY_MS = 80;

/**
 * Width of the left column in `sideMode`. Shared between the
 * left column's own `width` and the right column's `left` offset
 * (the right column is `absolute`-positioned so it can scroll
 * independently of the left). Single source of truth — change it
 * once if the categories panel ever needs more breathing room.
 */
const SIDE_MODE_LEFT_PX = 256;

/**
 * Generic header dropdown.
 *
 * Built on a native `<details>` element so:
 *
 *   - keyboard activation (Enter / Space on summary) works for free;
 *   - the open state composes with `header:has(details[open])` in
 *     `globals.css`, which is how the header background fades from
 *     translucent-blur to opaque-white whenever any dropdown is open;
 *   - React state mirrors the DOM open attribute (synced via `onToggle`)
 *     so we can wire close-on-outside-click and aria-expanded without
 *     reading refs during render — which the React 19 hooks rules
 *     (rightly) forbid.
 *
 * Two layouts:
 *
 *   - **default** — `children` render directly inside the panel.
 *   - **`sideMode`** — children render in a left column (single-column
 *     item list). Each `<DropdownItem>` may carry a `sidePanel`
 *     prop; whichever item the cursor is over has its `sidePanel`
 *     mirrored into a right column attached to the dropdown. Used
 *     by the Categories trigger to project subcategories on hover.
 *
 * The same component therefore powers the simple Account list AND
 * the categories-with-subcategories mega-panel. Easy to add a third
 * surface later (filters, language switcher, …) with whichever mode
 * suits.
 */

interface DropdownCloseContextValue {
  close: () => void;
}

const DropdownCloseContext = createContext<DropdownCloseContextValue | null>(
  null,
);

/**
 * Hook for children inside a `<Dropdown>` who need to close the
 * dropdown after acting (e.g. a clickable header in a sideMode
 * panel that navigates and shouldn't leave the panel hanging
 * open). Outside a Dropdown the hook is a no-op so consumers can
 * be used in stand-alone contexts too.
 */
export function useDropdownClose(): () => void {
  const ctx = useContext(DropdownCloseContext);
  return ctx?.close ?? noop;
}

function noop() {}

/** Active side-panel state for the categories-style layout. Items
 *  with a `sidePanel` register themselves on `mouseenter`; the
 *  Dropdown renders the active item's panel content. */
interface DropdownSideContextValue {
  /** Currently active item key, or `null` if none / not in sideMode. */
  activeKey: string | null;
  /** Set the side panel from a hovered item. No-op outside sideMode. */
  setActive: (key: string, content: ReactNode) => void;
  /** Promote the first registered item to active on mount if nothing
   *  else has claimed it yet — so the panel isn't empty on first
   *  open. Atomic via functional setState. */
  setActiveIfNone: (key: string, content: ReactNode) => void;
}

const DropdownSideContext = createContext<DropdownSideContextValue | null>(
  null,
);

export interface DropdownProps {
  /** Visible trigger content (icon + label). The caret is appended
   *  automatically so every dropdown stays visually consistent. */
  trigger: ReactNode;
  /** Panel contents — plain JSX. In `sideMode` this becomes the
   *  left column of items; otherwise it's the whole panel. */
  children: ReactNode;
  /** Panel horizontal anchor relative to the trigger. Right-align for
   *  trailing-edge triggers (account, language) so the panel doesn't
   *  hang off the viewport. */
  align?: "left" | "right";
  /** Optional className for the panel wrapper (default + sideMode). */
  panelClassName?: string;
  /** In sideMode: className for the inner left column only. */
  mainColumnClassName?: string;
  /** In sideMode: className for the right (side) column container. */
  sidePanelClassName?: string;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
  /** ARIA label for the trigger when no inline text is provided. */
  ariaLabel?: string;
  /** Enable the two-column layout for nested categories. When set, any
   *  `<DropdownItem>` child with a `sidePanel` prop renders its
   *  content in the right column on hover. */
  sideMode?: boolean;
}

interface ActiveSide {
  key: string;
  content: ReactNode;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  panelClassName,
  mainColumnClassName,
  sidePanelClassName,
  triggerClassName,
  ariaLabel,
  sideMode = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeSide, setActiveSide] = useState<ActiveSide | null>(null);
  const ref = useRef<HTMLDetailsElement>(null);
  /* Mobile suppresses hover-intent open/close and row-hover side
   * panel activation — taps drive everything instead. The dropdown
   * surface itself stays click-functional (summary toggle, row
   * navigation); only the hover heuristics are stripped so a
   * touch-emitted synthetic mouseenter doesn't fire phantom opens
   * or sticky side panels on iOS / Android Chrome. */
  const isTouch = useIsTouch();

  // Two separate timers — `open` and `close` — so a re-entry into
  // the trigger after a brief mouseleave cancels the scheduled close
  // before it fires, and vice versa for fast hover-out/hover-in.
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer]);

  const closeCtx = useMemo<DropdownCloseContextValue>(
    () => ({ close }),
    [close],
  );

  const sideCtx = useMemo<DropdownSideContextValue>(
    () => ({
      activeKey: activeSide?.key ?? null,
      setActive: (key, content) => setActiveSide({ key, content }),
      setActiveIfNone: (key, content) =>
        setActiveSide((prev) => prev ?? { key, content }),
    }),
    [activeSide],
  );

  // Click-outside + Escape close. Mousedown beats the panel's own
  // click handlers, so option clicks still navigate before the closer
  // runs against them.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cleanup orphan timers on unmount.
  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearOpenTimer, clearCloseTimer]);

  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  // Hover-intent on the outer <details> covers both the summary and
  // the panel (and, in sideMode, the side column too). Touch devices
  // skip these — clicking the summary uses the native toggle path.
  // Both handlers no-op on touch so synthetic mouseenter events
  // from iOS / Android Chrome can't open the panel on tap.
  const onMouseEnter = () => {
    if (isTouch) return;
    clearCloseTimer();
    if (open) return;
    openTimerRef.current = setTimeout(
      () => setOpen(true),
      HOVER_OPEN_DELAY_MS,
    );
  };
  const onMouseLeave = () => {
    if (isTouch) return;
    clearOpenTimer();
    if (!open) return;
    closeTimerRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };

  // Tap / keyboard activation. preventDefault stops the native
  // `<summary>` toggle so our controlled state stays authoritative.
  // Open-only: clicking the trigger never *closes* the dropdown —
  // hover-out timeout, click-outside, Escape, and item selection
  // all already handle that, and accidentally re-clicking a hovered
  // trigger used to dismiss the panel right after hover-intent
  // opened it. Touch users still get an explicit "open" gesture.
  const onSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    clearOpenTimer();
    clearCloseTimer();
    setOpen(true);
  };

  const panel =
    sideMode ? (
      // Layout invariants for sideMode (don't change without
      // also revisiting `SIDE_MODE_LEFT_PX` below):
      //
      //   - The wrapper is `relative` so the right column can be
      //     `absolute` against it. Putting the right column out
      //     of flex flow means it doesn't contribute to the
      //     wrapper's height — the wrapper sizes to the left
      //     column's natural height alone, and the right column
      //     fills that vertical space and scrolls internally
      //     when its content overflows. Net effect: the panel
      //     always "ends where the category list ends".
      //   - The left column owns the visible separator (right
      //     border) instead of a flex `divide-x`, since the right
      //     column isn't a flex sibling any more.
      <div
        className={cn(
          "relative flex",
          panelClassName ?? "w-[44rem]",
        )}
      >
        <div
          className={cn(
            "shrink-0 border-r border-[color:var(--color-border)] py-2",
            mainColumnClassName ?? "pl-1.5 pr-1.5",
          )}
          style={{ width: SIDE_MODE_LEFT_PX }}
        >
          {children}
        </div>
        {/* React `key` keyed on the active item — forces the previous
            side panel to unmount when the user hovers a new row, so
            old icons can't bleed through while the new ones decode.
            Pairs with the shimmer skeletons inside the panel: every
            category swap shows a clean shimmer-first state.
            The column is a `flex flex-col` with `overflow-hidden`
            so consumers can pin a header (shrink-0) above a
            scrollable list (flex-1 overflow-y-auto) — the
            categories panel uses this for its sticky title. */}
        <div
          key={activeSide?.key ?? "empty"}
          className={cn(
            "absolute inset-y-0 right-0 flex flex-col overflow-hidden",
            sidePanelClassName,
          )}
          style={{ left: SIDE_MODE_LEFT_PX }}
        >
          {activeSide?.content}
        </div>
      </div>
    ) : (
      <div
        className={cn(
          panelClassName ?? "min-w-[14rem] py-1.5",
        )}
      >
        {children}
      </div>
    );

  return (
    <DropdownCloseContext.Provider value={closeCtx}>
      <DropdownSideContext.Provider value={sideCtx}>
        {/* Backdrop sits behind the header by default — page content
            dims while the bar stays crisp. */}
        <Backdrop open={open} />
        <details
          ref={ref}
          open={open}
          onToggle={onToggle}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          /* `self-stretch` so the details fills the header row's
             full height. The visible pill stays compact because
             the `header-nav-link` styles live on the *inner*
             span; the summary itself is just a transparent
             full-height hit target. Net effect: `top-full` on
             the panel below lands at the header row's bottom,
             so the dropdown opens flush against the header
             without a hand-tuned offset. Named group so nested
             `group-hover/*` scopes (e.g. the subcategory tiles
             in the side panel) only react to their own hover,
             not to "anywhere in the dropdown". */
          className="group/dropdown relative self-stretch"
        >
          <summary
            aria-label={ariaLabel}
            aria-expanded={open}
            onClick={onSummaryClick}
            className="flex h-full cursor-pointer list-none items-center select-none"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                triggerClassName ?? "header-nav-link",
              )}
            >
              {trigger}
              <ChevronDownIcon className="h-3.5 w-3.5 text-[color:var(--color-ink-secondary)] transition-transform duration-200 group-open/dropdown:-rotate-180" />
            </span>
          </summary>
          <div
            className={cn(
              "absolute top-full z-40 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {panel}
          </div>
        </details>
      </DropdownSideContext.Provider>
    </DropdownCloseContext.Provider>
  );
}

/**
 * Option row inside a dropdown panel. Auto-closes the enclosing
 * `<Dropdown>` on click via context.
 *
 * In sideMode, providing a `sidePanel` prop turns this row into a
 * "has more" affordance: hovering the row mirrors the supplied content
 * into the dropdown's right column, and a right chevron renders next
 * to the label so the user knows there's more behind it.
 */
export interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  /** Leading icon (a small SVG or image). */
  icon?: ReactNode;
  /** Trailing badge (count, "New", etc.). */
  badge?: ReactNode;
  /** When true, render a right-chevron at the end of the row.
   *  Auto-enabled when `sidePanel` is provided. */
  arrow?: boolean;
  /** sideMode-only: panel content shown in the dropdown's right
   *  column when this row is hovered. Ignored outside sideMode. */
  sidePanel?: ReactNode;
  /** sideMode-only: stable key used to identify the active row.
   *  Defaults to `href`, then to the rendered text. */
  itemKey?: string;
  /** Visual emphasis variant — `danger` is used for the Logout row in
   *  the account dropdown. */
  variant?: "default" | "danger";
  className?: string;
}

export function DropdownItem({
  children,
  onClick,
  href,
  active,
  icon,
  badge,
  arrow,
  sidePanel,
  itemKey,
  variant = "default",
  className,
}: DropdownItemProps) {
  const close = useDropdownClose();
  const side = useContext(DropdownSideContext);
  const sideEnabled = side !== null && Boolean(sidePanel);
  /* Same rationale as in `<Dropdown>`: skip the row-hover side panel
   * activation on mobile so a tap can't trigger a "hovered" state
   * via a synthetic mouseenter from iOS / Android. The default
   * `setActiveIfNone` registration still runs so the side panel
   * isn't blank — the first item just stays as the resting view. */
  const isTouch = useIsTouch();

  const key =
    itemKey ?? href ?? (typeof children === "string" ? children : null);

  // Register the first sideMode-eligible item as the default active
  // panel so the right column isn't empty before the cursor lands.
  // useEffect (not render) keeps this strict-mode-safe.
  useEffect(() => {
    if (!sideEnabled || !key || !side) return;
    side.setActiveIfNone(key, sidePanel);
  }, [sideEnabled, key, sidePanel, side]);

  const isActive =
    sideEnabled && key !== null && side?.activeKey === key;

  const handleEnter = () => {
    if (isTouch) return;
    if (!sideEnabled || !key || !side) return;
    side.setActive(key, sidePanel);
  };

  const handleClick = () => {
    onClick?.();
    close();
  };

  const inner = (
    <span
      className={cn(
        // Shared hover / active treatment across every dropdown row:
        // very-light backplate + brand-coloured text. Bolder
        // `font-medium` weight is baked in by default — the row
        // already reads as a primary nav target rather than secondary
        // body text, so we don't switch weights on hover (avoids
        // layout shift; truncate span below only handles long labels).
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium",
        "transition-colors",
        variant === "danger"
          ? "text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger-soft)]"
          : isActive || active
            ? "bg-[color:var(--color-hover)] text-[color:var(--color-brand)]"
            : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover)] hover:text-[color:var(--color-brand)]",
        className,
      )}
    >
      {icon && (
        <span className="inline-flex shrink-0 items-center">{icon}</span>
      )}
      <span className="flex-1 truncate">{children}</span>
      {badge && (
        <span className="inline-flex shrink-0 items-center text-xs text-[color:var(--color-ink-muted)]">
          {badge}
        </span>
      )}
      {(arrow || sideEnabled) && (
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-[color:var(--color-ink-muted)]" />
      )}
    </span>
  );

  // In sideMode, items navigate to their own collection on click but
  // also paint their subcategories on hover. Click handler dismisses
  // the dropdown so the navigated route opens against a clean header.
  if (href) {
    return (
      <a
        href={href}
        onClick={handleClick}
        onMouseEnter={handleEnter}
        className="block"
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleEnter}
      className="block w-full"
    >
      {inner}
    </button>
  );
}
