"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SearchIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import type { SuggestProduct, SuggestResult } from "@/lib/salespace/suggest";
import { cn } from "@/lib/utils";

/**
 * Search modal — the suggestion panel that drops below the search
 * input when the search bar has focus. Same visual language as the
 * rest of the storefront (white surface, soft border, rounded-2xl,
 * subtle shadow) but kept as its own component (not a `<Dropdown>`)
 * because it'll grow product-recommendation, history, and trending
 * sections that the generic dropdown doesn't model.
 *
 * Composition:
 *
 *   ┌─ search bar (header) ──────────────────────────┐
 *   │ [icon]  cat________________  [×] [→]            │
 *   └────────────────────────────────────────────────┘
 *   ┌─ modal (absolute, top-full, mt-2) ──────────────┐
 *   │  SUGGESTIONS                                    │
 *   │  🔍 cat hanging bed                             │
 *   │  🔍 cat scratch sofa                            │
 *   ├─────────────────────────────────────────────────┤
 *   │  PRODUCTS                                       │
 *   │  [img] Cat Hanging Bed                          │
 *   │  [img] Cat Tree Premium                         │
 *   └─────────────────────────────────────────────────┘
 *
 * Why the modal lives *inside* the search form:
 *
 *   Clicks on links inside the modal would otherwise blur the
 *   input and unmount the modal before the click could fire. Two
 *   things keep that from happening:
 *
 *     1. The modal is a DOM child of the form, so the
 *        focus-within tracking in `SearchBar` keeps the form
 *        "focused" while the user interacts with it.
 *     2. Each clickable item runs `onMouseDown.preventDefault()`
 *        so the input never loses focus when the user mouses down
 *        on a link. After `onClick` fires (and we navigate +
 *        explicitly call `onClose`), the modal disappears in a
 *        clean, single step.
 *
 * Layering: rendered at `z-40`, just above the backdrop (`z-30`)
 * and below the header (`z-50`). The whole header strip stays
 * crisp on top of the dimmed page.
 */

const DEBOUNCE_MS = 180;

/* Display-side caps on what the modal renders out of the
 * upstream response. The fetch always returns up to 5 keywords +
 * 5 products (`MAX_KEYWORDS` / `MAX_PRODUCTS` in
 * `salespace/suggest.ts`); the desktop panel shows all of them,
 * while the mobile sheet trims to 2 + 3.
 *
 * Asymmetric mobile caps reflect what each section is *for*:
 * keyword suggestions are typed shortcuts (a couple of "did you
 * mean…" is enough), product cards are the actual results
 * (showing a few is the point). 2 keywords keeps the typed
 * shortcuts from pushing the product hits below the fold; 3
 * products fits in the sheet without forcing a scroll.
 *
 * Keeping the cap here (not in the fetch) means a future redesign
 * — say, "show 5 on tablets" — is a one-line change and the
 * server-side data layer keeps its single contract. */
const DESKTOP_DISPLAY_CAP = 5;
const MOBILE_KEYWORD_CAP = 2;
const MOBILE_PRODUCT_CAP = 3;

export interface SearchModalProps {
  /** Live input value. We debounce internally before fetching. */
  query: string;
  /** Whether the search form currently has focus-within. */
  open: boolean;
  /** Called when the user picks a suggestion or product. Should
   *  blur the input on the caller side so this modal unmounts. */
  onClose: () => void;
  /**
   * Strip the floating chrome (absolute positioning, rounded
   * border, shadow, max-height cap) so the suggestions render as
   * a plain in-flow block. Used by `<MobileSearchSheet>`, which
   * already owns its own container chrome — the floating defaults
   * are tuned for the desktop header bar and don't translate to
   * a full-height mobile sheet.
   */
  embedded?: boolean;
}

export function SearchModal({
  query,
  open,
  onClose,
  embedded = false,
}: SearchModalProps) {
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);
  const { data, isLoading } = useSearchSuggestions(debounced);

  if (!open) return null;

  const keywordCap = embedded ? MOBILE_KEYWORD_CAP : DESKTOP_DISPLAY_CAP;
  const productCap = embedded ? MOBILE_PRODUCT_CAP : DESKTOP_DISPLAY_CAP;
  const keywords = data?.keywords.slice(0, keywordCap) ?? [];
  const products = data?.products.slice(0, productCap) ?? [];
  const hasKeywords = keywords.length > 0;
  const hasProducts = products.length > 0;
  const hasResults = hasKeywords || hasProducts;
  // Skeleton covers both the in-flight fetch *and* the brief gap
  // between a keystroke and the debounce window firing — without
  // the second case the user would see an empty flash mid-typing.
  // Empty-query fetches are also skeletoned on first focus so we
  // don't render with stale or missing default suggestions.
  const showSkeleton = isLoading || debounced !== trimmed;

  return (
    <div
      role="dialog"
      aria-label="Search suggestions"
      className={cn(
        embedded
          ? // In-flow variant — the parent (mobile search sheet)
            // already owns the panel chrome, so we strip our own
            // floating decorations and let the suggestions fill
            // whatever block we land in.
            "bg-[color:var(--color-surface)]"
          : cn(
              // Anchor flush against the header's bottom edge —
              // same position the category / account dropdown
              // panels land at. The form is h-10 inside an h-16
              // row, so its bottom sits (16 - 10) / 2 = 12px above
              // the row's bottom edge. Bumping the panel's top by
              // 12px lines it up with the header bottom. Hand-
              // tuned rather than `self-stretch`'d because the
              // input itself must stay h-10.
              "absolute left-0 right-0 top-[calc(100%+12px)] z-40",
              "max-h-[70vh] overflow-y-auto",
              "rounded-2xl border border-[color:var(--color-border)]",
              "bg-white shadow-lg shadow-black/10",
            ),
      )}
    >
      {showSkeleton && (
        <ResultsSkeleton keywordCap={keywordCap} productCap={productCap} />
      )}
      {!showSkeleton && !hasResults && (
        // Only reachable when the upstream truly returns nothing
        // for a typed query (popular suggestions always have a
        // baseline keyword list, so the empty-query path never
        // lands here).
        <NoResults query={debounced} />
      )}
      {!showSkeleton && hasResults && (
        <div>
          {hasKeywords && (
            <KeywordsSection keywords={keywords} onClose={onClose} />
          )}
          {/* Between-section divider that lines up with the section
              labels' horizontal padding (px-3) — keeps the rhythm
              consistent with where the eye expects content edges
              instead of cutting flush across the modal. */}
          {hasKeywords && hasProducts && (
            <div className="mx-3 border-t border-[color:var(--color-border)]" />
          )}
          {hasProducts && (
            <ProductsSection products={products} onClose={onClose} />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

const SECTION_LABEL_CLASS = cn(
  "px-3 pb-1 pt-3",
  "text-[11px] font-bold uppercase tracking-wide",
  "text-[color:var(--color-ink-muted)]",
);

function KeywordsSection({
  keywords,
  onClose,
}: {
  keywords: string[];
  onClose: () => void;
}) {
  return (
    <section aria-label="Suggested keywords" className="pb-2">
      <p className={SECTION_LABEL_CLASS}>Suggestions</p>
      <ul>
        {keywords.map((kw) => (
          <li key={kw}>
            <Link
              href={`/search?q=${encodeURIComponent(kw)}`}
              onMouseDown={preventBlur}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                "text-sm text-[color:var(--color-ink)]",
                "transition-colors hover:bg-[color:var(--color-hover-strong)]",
              )}
            >
              <SearchIcon className="h-4 w-4 shrink-0 text-[color:var(--color-ink-muted)]" />
              <span className="truncate">{kw}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductsSection({
  products,
  onClose,
}: {
  products: SuggestProduct[];
  onClose: () => void;
}) {
  return (
    <section aria-label="Suggested products" className="pb-2">
      <p className={SECTION_LABEL_CLASS}>Products</p>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <Link
              href={`/products/${p.handle}`}
              onMouseDown={preventBlur}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                "transition-colors hover:bg-[color:var(--color-hover-strong)]",
              )}
            >
              <ShimmerImage
                src={p.image_url}
                alt={p.title}
                wrapperClassName="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-[color:var(--color-surface-muted)]"
                className="h-full w-full object-cover"
                skeletonRounded="md"
              />
              <span className="line-clamp-2 flex-1 text-sm leading-snug text-[color:var(--color-ink)]">
                {p.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / loading states                                              */
/* ------------------------------------------------------------------ */

function NoResults({ query }: { query: string }) {
  return (
    <div className="p-6 text-center text-sm text-[color:var(--color-ink-muted)]">
      No results for{" "}
      <span className="font-semibold text-[color:var(--color-ink)]">
        “{query}”
      </span>
      .
    </div>
  );
}

/* Skeleton row counts track the actual caps so the placeholder
 * layout matches the real-data layout — no row-count flicker
 * when the fetch resolves. Mobile renders 2 + 3, desktop renders
 * 5 + 5. */
function ResultsSkeleton({
  keywordCap,
  productCap,
}: {
  keywordCap: number;
  productCap: number;
}) {
  return (
    <div className="py-2">
      <p className={SECTION_LABEL_CLASS}>Suggestions</p>
      <ul className="space-y-1 px-3 py-1">
        {Array.from({ length: keywordCap }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-5 w-3/4 rounded" />
          </li>
        ))}
      </ul>
      <p className={SECTION_LABEL_CLASS}>Products</p>
      <ul className="space-y-2 px-3 py-1">
        {Array.from({ length: productCap }, (_, i) => (
          <li key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
            <Skeleton className="h-4 flex-1 rounded" />
            <Skeleton className="h-4 w-12 shrink-0 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Sleeps `delay` ms before publishing `value`. Re-running the
 * effect on each change cancels the previous timer, so we only
 * ever emit the last value the caller settled on. Used to throttle
 * the suggestion fetch — typing "cats" should produce one network
 * call, not four.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (debounced === value) return;
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, debounced]);
  return debounced;
}

interface SuggestState {
  /** Last `query` value that drove the current state. We track it
   *  inside the state object so render-time prop-derived updates
   *  can detect a mismatch without a separate `prevQuery` mirror. */
  query: string;
  data: SuggestResult | null;
  isLoading: boolean;
}

export interface SuggestView {
  data: SuggestResult | null;
  isLoading: boolean;
}

/**
 * Drives the modal's data with two concerns kept separate:
 *
 *   • **Prop-derived state (render-time)** — when the caller passes
 *     a new `query`, we snap the state's `query`, mark `isLoading`,
 *     and clear stale `data` if the new query is empty. This is the
 *     React-19-canonical pattern (used by `<ShimmerImage>` too) and
 *     keeps the lint clean — no synchronous setState inside an
 *     effect body.
 *
 *   • **Side effect (useEffect)** — owns only the fetch lifecycle.
 *     AbortController cancellation guarantees a slow response for
 *     an old query can never overwrite a newer one, even if a
 *     spinner is still in flight when the user keeps typing.
 */
/**
 * Sentinel for "we haven't kicked off any fetch yet" — distinct
 * from the empty string `""`, which is itself a valid query (it
 * yields the popular-keywords + best-sellers response).
 */
const NO_QUERY = "\u0000";

function useSearchSuggestions(query: string): SuggestView {
  const [state, setState] = useState<SuggestState>({
    query: NO_QUERY,
    data: null,
    isLoading: false,
  });

  if (state.query !== query) {
    setState({
      query,
      // Keep showing stale data while the new fetch is in flight so
      // the modal doesn't flash empty between keystrokes. (The
      // empty-query case stays here too — we want the previously-
      // loaded popular suggestions to linger while the new typed
      // query resolves.)
      data: state.data,
      isLoading: true,
    });
  }

  useEffect(() => {
    const ctrl = new AbortController();

    fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: SuggestResult) =>
        setState({ query, data, isLoading: false }),
      )
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error("[search-modal] fetch failed", err);
        setState({ query, data: null, isLoading: false });
      });

    return () => ctrl.abort();
  }, [query]);

  return { data: state.data, isLoading: state.isLoading };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * `mousedown` on a focusable element transfers focus to it, which
 * blurs our `<input>` and would unmount the modal before the
 * click event could fire. Calling `preventDefault` here cancels
 * the focus transfer; the click still fires normally so the link
 * navigates, then our `onClick` runs `onClose` to close the modal
 * deliberately.
 */
function preventBlur(e: ReactMouseEvent) {
  e.preventDefault();
}
