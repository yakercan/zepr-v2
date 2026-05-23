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
import { ChevronDownIcon } from "@/components/ui/icons";

/**
 * Generic header dropdown.
 *
 * Built on a native `<details>` element so:
 *
 *   - keyboard activation (Enter / Space on summary) works for free;
 *   - the open state composes with the `header:has(details[open])`
 *     selector in `globals.css`, which is how the header background
 *     fades from translucent-blur to opaque-white whenever any
 *     dropdown is open;
 *   - React state mirrors the DOM open attribute (synced via `onToggle`)
 *     so we can wire close-on-outside-click and aria-expanded without
 *     reading refs during render — which the React 19 hooks rules
 *     (rightly) forbid.
 *
 * The same component powers the Categories trigger, the Account
 * trigger, and anything else we add later (filters, language switcher,
 * etc.). The trigger slot accepts whatever icon+label markup the call
 * site needs; the caret is appended here so every dropdown stays
 * visually consistent.
 *
 * `DropdownItem` reads the close callback off a React context and
 * dismisses the dropdown on click automatically, so call sites can
 * just pass JSX children — no render-prop / function-as-child needed.
 * That matters because the host (`SiteHeader`) stays a Server Component;
 * functions can't cross the RSC boundary, JSX can.
 */
interface DropdownContextValue {
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownClose(): () => void {
  const ctx = useContext(DropdownContext);
  return ctx?.close ?? noop;
}

function noop() {}

export interface DropdownProps {
  /** Visible trigger content (icon + label). The caret is appended
   *  automatically so every dropdown stays visually consistent. */
  trigger: ReactNode;
  /** Panel contents — plain JSX. Use `<DropdownItem>` for option rows
   *  so each click auto-dismisses without wiring callbacks at every site. */
  children: ReactNode;
  /** Panel horizontal anchor relative to the trigger. Right-align for
   *  trailing-edge triggers (account, language) so the panel doesn't
   *  hang off the viewport. */
  align?: "left" | "right";
  /** Optional className for the panel — width, max-height, padding. */
  panelClassName?: string;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
  /** ARIA label for the trigger when no inline text is provided. */
  ariaLabel?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  panelClassName,
  triggerClassName,
  ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const ctxValue = useMemo<DropdownContextValue>(() => ({ close }), [close]);

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

  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  return (
    <DropdownContext.Provider value={ctxValue}>
      <details
        ref={ref}
        open={open}
        onToggle={onToggle}
        className="group relative"
      >
        <summary
          aria-label={ariaLabel}
          aria-expanded={open}
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
            "absolute top-[calc(100%+8px)] z-40 rounded-xl border border-[color:var(--color-border)] bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]",
            align === "right" ? "right-0" : "left-0",
            panelClassName ?? "min-w-[14rem] py-1.5",
          )}
        >
          {children}
        </div>
      </details>
    </DropdownContext.Provider>
  );
}

/**
 * Standard option row inside a dropdown panel. Auto-closes the
 * enclosing `<Dropdown>` on click via context, so call sites pass
 * plain JSX without wiring per-item handlers.
 */
export function DropdownItem({
  children,
  onClick,
  href,
  active,
  icon,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const close = useDropdownClose();
  const handleClick = () => {
    onClick?.();
    close();
  };

  const inner = (
    <span
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-[color:var(--color-brand-light)] font-medium text-[color:var(--color-brand)]"
          : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-search)]",
        className,
      )}
    >
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );

  if (href) {
    return (
      <a href={href} onClick={handleClick} className="block">
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={handleClick} className="block w-full">
      {inner}
    </button>
  );
}
