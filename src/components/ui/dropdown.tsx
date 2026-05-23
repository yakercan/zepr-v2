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
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";

/**
 * Hover intent timings, ms.
 *
 * Open delay is intentionally tiny — anything over ~80ms feels
 * sluggish on a cursor sweep into the trigger. Close delay is
 * longer so the cursor has time to cross the gap between the
 * summary and the panel without losing the dropdown.
 */
const HOVER_OPEN_DELAY_MS = 80;
const HOVER_CLOSE_DELAY_MS = 180;

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

function useDropdownClose(): () => void {
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
  const onMouseEnter = () => {
    clearCloseTimer();
    if (open) return;
    openTimerRef.current = setTimeout(
      () => setOpen(true),
      HOVER_OPEN_DELAY_MS,
    );
  };
  const onMouseLeave = () => {
    clearOpenTimer();
    if (!open) return;
    closeTimerRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };

  // Tap toggle for touch/keyboard. preventDefault stops the native
  // `<summary>` toggle so our controlled state stays authoritative.
  const onSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    clearOpenTimer();
    clearCloseTimer();
    setOpen((prev) => !prev);
  };

  const panel =
    sideMode ? (
      <div
        className={cn(
          "flex divide-x divide-[color:var(--color-border)]",
          panelClassName ?? "w-[44rem]",
        )}
      >
        <div
          className={cn(
            "py-2",
            mainColumnClassName ?? "w-[16rem] shrink-0 pl-1.5 pr-1",
          )}
        >
          {children}
        </div>
        <div
          className={cn(
            "flex-1 p-5",
            sidePanelClassName,
          )}
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
        <details
          ref={ref}
          open={open}
          onToggle={onToggle}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="group relative"
        >
          <summary
            aria-label={ariaLabel}
            aria-expanded={open}
            onClick={onSummaryClick}
            className={cn(
              "flex cursor-pointer list-none items-center gap-1.5 select-none",
              triggerClassName ?? "header-nav-link",
            )}
          >
            {trigger}
            <ChevronDownIcon className="h-3.5 w-3.5 text-[color:var(--color-ink-secondary)] transition-transform duration-200 group-open:-rotate-180" />
          </summary>
          <div
            className={cn(
              "absolute top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]",
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
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        variant === "danger"
          ? "text-[#c2410c] hover:bg-[#fff1ea]"
          : isActive || active
            ? "bg-[color:var(--color-search)] font-medium text-[color:var(--color-ink)]"
            : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-search)]",
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
