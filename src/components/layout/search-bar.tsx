"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
} from "react";
import { SearchModal } from "@/components/layout/search-modal";
import { Backdrop } from "@/components/ui/backdrop";
import {
  ArrowRightIcon,
  CloseIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** Shared layout for the Clear (×) and Submit (→) buttons inside the
 *  search bar — fixed circular footprint, soft grey halo on hover.
 *  Per-button text color (neutral vs brand) is layered on top at the
 *  call site so both still share one source of truth for sizing. */
const SEARCH_BAR_BUTTON_BASE = cn(
  "flex h-6 w-6 items-center justify-center rounded-full",
  "transition-colors hover:bg-[color:var(--color-border)]",
);

/**
 * Header search bar.
 *
 * Submit-mode field — Enter or the right-arrow button both POST the
 * query to `/search?q=…` via standard form GET semantics; no JS-only
 * navigation, so it keeps working without hydration. State is just the
 * input value so the clear (×) and submit (→) chevrons can appear /
 * disappear in sync.
 *
 * Layout pattern (ported from the salespace navbar):
 *   - `pl-9` reserves space for the left-aligned magnifier icon
 *   - `pr-15` reserves space for the right-side button pair AT ALL
 *     TIMES so the field width doesn't jitter the moment a character
 *     is typed
 *   - the two right-side buttons render only when `value.length > 0`,
 *     in a small group at `right-1.5`
 *
 * Colors swapped from salespace's navy to our brand orange via
 * `--color-brand` / `--color-brand-hover`; everything else is
 * structurally identical.
 */
export function SearchBar() {
  const router = useRouter();
  /* `?q` from the current URL — when the user is on `/search?q=foo`,
   * we want the bar to read "foo" so they always see what they
   * searched for and can edit it. Empty everywhere else. */
  const urlQuery = useSearchParams().get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  /* React 19-clean URL-derived state sync: when the URL's `q` changes
   * externally (back/forward, click on a suggestion, navigation from
   * a category page) we adopt the new value. Conditional setState
   * during render is the canonical pattern for this — no useEffect,
   * no flicker. */
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = value.length > 0;

  /* Backdrop + search modal both activate the moment focus enters
   * the search form and deactivate only when focus leaves it
   * entirely. We use a focus-within check via `relatedTarget` so
   * flips between the input and the clear / submit buttons (and
   * the suggestion items inside the modal, which run their own
   * `mousedown.preventDefault` to never even take focus) don't
   * flicker the overlay. The dropdown component uses the exact
   * same `<Backdrop open={…} />` pattern — one shared overlay
   * primitive across the whole header. */
  const [isFocused, setIsFocused] = useState(false);
  const handleFormFocus = () => setIsFocused(true);
  const handleFormBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsFocused(false);
  };

  /* Stable callback that the modal hands to each suggestion item.
   * Blurring the input fires the form's `onBlur` exactly once,
   * which flips `isFocused` to false and unmounts both the
   * backdrop and the modal in a single, clean step — no flicker,
   * no double-close. */
  const closeModal = useCallback(() => {
    inputRef.current?.blur();
  }, []);

  /* Mutex with the header dropdowns.
   *
   * Header dropdowns (Categories, Account, future filters) open
   * on hover *without* changing focus, so without this hook the
   * search modal would stay visible alongside the dropdown
   * panel — two overlapping overlays at once.
   *
   * Cleanest decoupling: listen for the native `toggle` event on
   * any `<details>` in the header (capture phase, since `toggle`
   * doesn't bubble). When one opens, blur the input — which fires
   * the form's `onBlur`, closes the modal, and fades the backdrop
   * in one clean step. Dropdown component stays untouched; this
   * component just reacts to the DOM.
   *
   * Scoped via `closest(".site-header")` so unrelated `<details>`
   * elsewhere on the page (FAQ accordions, etc.) can't close the
   * search by accident. */
  useEffect(() => {
    function onToggle(e: Event) {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "DETAILS") return;
      if (!(t as HTMLDetailsElement).open) return;
      if (!t.closest(".site-header")) return;
      inputRef.current?.blur();
    }
    document.addEventListener("toggle", onToggle, true);
    return () => document.removeEventListener("toggle", onToggle, true);
  }, []);

  const handleClear = () => {
    setValue("");
    inputRef.current?.focus();
  };

  /* JS-on path: client-side nav via the App Router so the page
   * doesn't full-reload. The `action="/search"` attribute on the
   * form still routes correctly if JS fails — preserving graceful
   * degradation for free.
   *
   * Blur whatever's currently focused *inside the form* — not
   * just the input. Pressing Enter blurs the input, but clicking
   * the submit (→) button moves DOM focus to the button itself,
   * so blurring the input does nothing and the suggestion modal
   * lingers. Querying `:focus` from the form covers both paths
   * in one branch — the form's `onBlur` then fires with
   * `relatedTarget=null`, collapsing backdrop + modal cleanly. */
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    const focused = e.currentTarget.querySelector(":focus");
    if (focused instanceof HTMLElement) focused.blur();
  };

  return (
    <>
      <Backdrop open={isFocused} />
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={handleSubmit}
        onFocus={handleFormFocus}
        onBlur={handleFormBlur}
        className="relative mx-auto h-10 min-w-0 max-w-2xl flex-1"
      >
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-secondary)]" />

        <input
          ref={inputRef}
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search products, brands, and more"
          autoComplete="off"
          className={cn(
            "h-10 w-full rounded-full bg-[color:var(--color-search)] pl-9 pr-15 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-muted)] outline-none transition-colors",
            // Hover === focus visually: white fill + 2px ink ring. Makes
            // the input look "ready" the moment the cursor touches it,
            // and removes the tiny visual jump that used to happen on
            // hover → focus when only the fill flipped.
            "hover:bg-white hover:ring-2 hover:ring-[color:var(--color-ink)]",
            "focus:bg-white focus:ring-2 focus:ring-[color:var(--color-ink)]",
          )}
        />

        {hasValue && (
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {/* Same footprint + hover halo on both buttons; text color
                tells them apart — neutral × for clear, brand-orange →
                for submit so the primary action stays obvious. */}
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className={cn(
                SEARCH_BAR_BUTTON_BASE,
                "text-[color:var(--color-ink-secondary)] hover:text-[color:var(--color-ink)]",
              )}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="submit"
              aria-label="Search"
              className={cn(
                SEARCH_BAR_BUTTON_BASE,
                "text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-hover)]",
              )}
            >
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Suggestion modal — lives inside the form so its links
            participate in focus-within tracking. Mounted only while
            focused so we don't ship the suggestion fetch until the
            user actually engages with the input. */}
        <SearchModal query={value} open={isFocused} onClose={closeModal} />
      </form>
    </>
  );
}
