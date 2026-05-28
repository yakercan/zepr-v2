"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { FilterBarPanel } from "@/components/ui/filter-bar-panel";
import { FilterPill } from "@/components/ui/filter-pill";
import { FilterPillTrigger } from "@/components/ui/filter-pill-trigger";
import { CheckIcon } from "@/components/ui/icons";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { SearchFacets } from "@/types/product";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Search-page filter bar.
 *
 * URL-driven (`?sort=`, `?subcategory=`, `?price_min=`,
 * `?price_max=`, `?size=`). Any filter commit resets `?page=`
 * so the user lands at the top of the new result set, and every
 * URL mutation rides `useTransition` so the existing grid stays
 * mounted while the new payload streams in.
 *
 * Two filter chrome variants share one bar:
 *
 *   - **Sort by** — small `<FilterPill>`, self-contained popover.
 *     Single-pick semantics: click an option → commits live and
 *     closes the panel.
 *   - **Category / Price / Size** — `<FilterPillTrigger>` pills
 *     that share one full-width `<FilterBarPanel>` below the
 *     row. The panel stages selections locally, then commits
 *     them all on **Show results**. **Reset** wipes the active
 *     filter's URL params and closes the panel in one step.
 *
 * Filters that don't have options for the current result set
 * (no `subcategory` facet, no `price.buckets` and no
 * `price.{min,max}`, no `options.Size`) are hidden — the bar
 * never shows a pill that would open into an empty panel.
 *
 * Within the bar, the large panel sits below the pill row
 * anchored via `position: relative` on this component's
 * wrapper.
 */

interface SortOption {
  /** Salespace `sort` key. Empty string = the implicit default
   *  ("Best Sellers"), encoded as the *absence* of `?sort` in the
   *  URL — keeps the canonical search URL clean. The server-side
   *  fetcher applies `best_sellers:desc` when this is empty. */
  value: string;
  label: string;
}

/* Order mirrors the merchandising hierarchy the storefront uses
 * elsewhere — Best Sellers and Hot Deals (the two homepage tabs
 * that drive the most traffic) sit at the top, followed by the
 * quality / recency sorts, then price low→high and high→low. Any
 * sort tweak should keep this ordering so the dropdown reads the
 * same way as the homepage feed tabs. */
const SORT_OPTIONS: readonly SortOption[] = [
  { value: "", label: "Best Sellers" },
  { value: "hot_deals:desc", label: "Hot Deals" },
  { value: "best_rated:desc", label: "Top Rated" },
  { value: "newest:desc", label: "Newest" },
  { value: "price:asc", label: "Price: Low to High" },
  { value: "price:desc", label: "Price: High to Low" },
] as const;

const DEFAULT_SORT_LABEL = SORT_OPTIONS[0].label;

type LargeFilterId = "category" | "price" | "size";

/* Heading for the mobile sheet variant of the large filter
 * panel. Desktop's inline panel sits below the pill that
 * triggered it (the pill already labels the open filter), so
 * the heading isn't surfaced there. On mobile the sheet
 * replaces that spatial cue, so each filter needs its own
 * title — kept in lockstep with the pill labels above. */
const FILTER_TITLES: Record<LargeFilterId, string> = {
  category: "Category",
  price: "Price",
  size: "Size",
};

interface StagedState {
  subcategory: string[];
  price_min: number | undefined;
  price_max: number | undefined;
  size: string[];
}

interface PriceBucket {
  key: string;
  min: number;
  max: number;
  isFirst: boolean;
  isLast: boolean;
}

interface PriceBounds {
  /** Lowest dollar amount with at least one matching product. */
  minDollars: number;
  /** Highest dollar amount with at least one matching product. */
  maxDollars: number;
}

export interface SearchFiltersProps {
  categories: readonly TaxonomyCategory[];
  facets: SearchFacets | undefined;
  /**
   * Hide the Category pill (and its panel content). Category
   * pages drive subcategory selection through the subcategory
   * slider above the filter row, so the duplicate pill would
   * just be a worse version of the same control.
   */
  hideCategory?: boolean;
}

export function SearchFilters({
  categories,
  facets,
  hideCategory = false,
}: SearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic mirror of the URL query string. The router only
  // surfaces a `router.replace` to `useSearchParams` *after* the
  // transition's data fetch lands — without this, every commit
  // would flash the pill as "no selection" while the new params
  // were still in flight, then snap to "selected" once the URL
  // caught up. `useOptimistic` lets us draw the next state at
  // commit time and rebases to the real URL automatically when
  // the transition resolves.
  const realQs = searchParams.toString();
  const [optimisticQs, setOptimisticQs] = useOptimistic<string, string>(
    realQs,
    (_prev, next) => next,
  );
  const activeParams = useMemo(
    () => new URLSearchParams(optimisticQs),
    [optimisticQs],
  );

  // Ref to the pill row — passed to `<FilterBarPanel>` so clicks
  // on a *different* pill (which already toggle the active id)
  // don't also fire the outside-click → close handler.
  const pillRowRef = useRef<HTMLDivElement>(null);

  const [openSmallFilter, setOpenSmallFilter] = useState<"sort" | null>(null);
  const [openLargeFilter, setOpenLargeFilter] = useState<LargeFilterId | null>(
    null,
  );

  /* -------------------- Committed URL state (optimistic) -------------------- */
  const currentSort = activeParams.get("sort") ?? "";
  const committedSubcategories = activeParams.getAll("subcategory");
  const committedPriceMin = parsePrice(activeParams.get("price_min"));
  const committedPriceMax = parsePrice(activeParams.get("price_max"));
  const committedSizes = activeParams.getAll("size");

  /* -------------------- Staged state -------------------- */
  // Local, ephemeral copy that the large panels mutate while
  // open. Committed → URL on "Show results"; discarded on
  // outside-click / Escape (because we reset on every panel
  // open).
  const [staged, setStaged] = useState<StagedState>({
    subcategory: committedSubcategories,
    price_min: committedPriceMin,
    price_max: committedPriceMax,
    size: committedSizes,
  });

  /* -------------------- Pill toggling -------------------- */
  function toggleSmall(id: "sort") {
    setOpenLargeFilter(null);
    setOpenSmallFilter((prev) => (prev === id ? null : id));
  }

  function toggleLarge(id: LargeFilterId) {
    // Two flat setters in one tick — React batches them. Keeps
    // the state updaters pure (no nested `setState` inside an
    // updater body, which strict-mode double-invokes).
    const isOpening = openLargeFilter !== id;
    setOpenSmallFilter(null);
    setOpenLargeFilter(isOpening ? id : null);
    if (isOpening) {
      // Resync staged with committed every time we open a panel
      // — discards anything left over from a previous
      // unsubmitted session.
      setStaged({
        subcategory: committedSubcategories,
        price_min: committedPriceMin,
        price_max: committedPriceMax,
        size: committedSizes,
      });
    }
  }

  /* -------------------- URL commit helpers -------------------- */
  function commitSort(nextSort: string) {
    const params = new URLSearchParams(optimisticQs);
    if (nextSort) params.set("sort", nextSort);
    else params.delete("sort");
    params.delete("page");
    pushParams(params);
  }

  function commitStaged() {
    const params = new URLSearchParams(optimisticQs);
    // Wipe the keys this panel controls, then write the staged
    // values back. Single source of truth → no stale ghosts left
    // in the URL from a previous selection.
    params.delete("subcategory");
    params.delete("price_min");
    params.delete("price_max");
    params.delete("size");

    for (const v of staged.subcategory) {
      if (v) params.append("subcategory", v);
    }

    // Price gets sanitised before it touches the URL — see
    // `sanitisePriceRange` for the swap → clamp → collapse flow.
    const { min: cleanMin, max: cleanMax } = sanitisePriceRange(
      staged.price_min,
      staged.price_max,
      priceBounds,
    );
    if (cleanMin !== undefined) {
      params.set("price_min", String(cleanMin));
    }
    if (cleanMax !== undefined) {
      params.set("price_max", String(cleanMax));
    }

    for (const v of staged.size) {
      if (v) params.append("size", v);
    }

    params.delete("page");
    pushParams(params);
    setOpenLargeFilter(null);
  }

  function pushParams(params: URLSearchParams) {
    const qs = params.toString();
    startTransition(() => {
      // Update the optimistic mirror first — within the same
      // transition tick — so the pills re-render with the new
      // committed state immediately, then `router.replace` lets
      // the real URL catch up off-thread. Without this the pill
      // would briefly read the *old* `useSearchParams` value and
      // pop from inactive → active when the navigation lands.
      setOptimisticQs(qs);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  /* -------------------- Reset active large filter -------------------- */
  // Reset clears the active filter both *locally* (staged) and
  // *globally* (URL → server), then closes the panel — same
  // path the user would take by clicking Show results after
  // manually deselecting every chip. We mirror the URL mutation
  // here (instead of routing through `commitStaged`) so other
  // filters' staged-but-uncommitted changes can't leak in.
  function resetActiveLargeFilter() {
    if (openLargeFilter === null) return;
    const params = new URLSearchParams(optimisticQs);
    switch (openLargeFilter) {
      case "category":
        params.delete("subcategory");
        break;
      case "price":
        params.delete("price_min");
        params.delete("price_max");
        break;
      case "size":
        params.delete("size");
        break;
    }
    params.delete("page");
    pushParams(params);
    setOpenLargeFilter(null);
  }

  /* -------------------- Derived: options + visibility -------------------- */
  const sortLabel = `Sort by: ${
    SORT_OPTIONS.find((o) => o.value === currentSort)?.label ?? DEFAULT_SORT_LABEL
  }`;

  const categoryOptions = useCategoryOptions(facets, categories);
  const priceBuckets = usePriceBuckets(facets);
  const priceBounds = usePriceBounds(facets);
  const sizeOptions = useSizeOptions(facets);

  const showCategory = !hideCategory && categoryOptions.length > 0;
  // Price filter shows whenever we have *any* signal — either
  // explicit buckets or just min/max bounds for the inputs.
  const showPrice = priceBuckets.length > 0 || priceBounds !== undefined;
  const showSize = sizeOptions.length > 0;

  return (
    <div
      role="group"
      aria-label="Search filters"
      className="relative"
    >
      <div
        ref={pillRowRef}
        className="flex flex-wrap items-center gap-2"
      >
        {/* -------------- Sort by (small, close-on-pick) -------------- */}
        {/* `hasSelection` is permanently `true` here: Sort by
            always has a value — even the absence of `?sort` is
            the meaningful "Best Sellers" default. Drawing it as
            idle would suggest "no sort picked yet", which is
            never true. */}
        <FilterPill
          label={sortLabel}
          isOpen={openSmallFilter === "sort"}
          hasSelection
          onToggle={() => toggleSmall("sort")}
        >
          <ul className="flex flex-col">
            {SORT_OPTIONS.map((opt) => {
              const isActive = opt.value === currentSort;
              return (
                <li key={opt.value || "default"}>
                  <button
                    type="button"
                    onClick={() => {
                      commitSort(opt.value);
                      setOpenSmallFilter(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2",
                      "rounded-md px-3 py-2 text-left text-sm",
                      "transition-colors hover:bg-[color:var(--color-surface-muted)]",
                      isActive &&
                        "font-semibold text-[color:var(--color-ink)]",
                    )}
                  >
                    <span>{opt.label}</span>
                    {isActive && (
                      <CheckIcon
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-[color:var(--color-ink)]"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </FilterPill>

        {/* -------------- Category (large, stage-and-apply) -------------- */}
        {showCategory && (
          <FilterPillTrigger
            label={
              committedSubcategories.length > 0
                ? `Category (${committedSubcategories.length})`
                : "Category"
            }
            isOpen={openLargeFilter === "category"}
            hasSelection={committedSubcategories.length > 0}
            onToggle={() => toggleLarge("category")}
          />
        )}

        {/* -------------- Price (large, stage-and-apply) -------------- */}
        {showPrice && (
          <FilterPillTrigger
            label={priceLabel(committedPriceMin, committedPriceMax)}
            isOpen={openLargeFilter === "price"}
            hasSelection={
              committedPriceMin !== undefined ||
              committedPriceMax !== undefined
            }
            onToggle={() => toggleLarge("price")}
          />
        )}

        {/* -------------- Size (large, stage-and-apply) -------------- */}
        {showSize && (
          <FilterPillTrigger
            label={
              committedSizes.length > 0
                ? `Size (${committedSizes.length})`
                : "Size"
            }
            isOpen={openLargeFilter === "size"}
            hasSelection={committedSizes.length > 0}
            onToggle={() => toggleLarge("size")}
          />
        )}
      </div>

      <FilterBarPanel
        isOpen={openLargeFilter !== null}
        onClose={() => setOpenLargeFilter(null)}
        onReset={resetActiveLargeFilter}
        onApply={commitStaged}
        excludeRef={pillRowRef}
        title={openLargeFilter ? FILTER_TITLES[openLargeFilter] : undefined}
      >
        {openLargeFilter === "category" && (
          <ChipGrid
            options={categoryOptions}
            selected={staged.subcategory}
            onToggle={(value) =>
              setStaged((s) => ({
                ...s,
                subcategory: toggleValue(s.subcategory, value),
              }))
            }
          />
        )}
        {openLargeFilter === "price" && (
          <PriceStaging
            buckets={priceBuckets}
            bounds={priceBounds}
            stagedMin={staged.price_min}
            stagedMax={staged.price_max}
            onChange={(price_min, price_max) =>
              setStaged((s) => ({ ...s, price_min, price_max }))
            }
          />
        )}
        {openLargeFilter === "size" && (
          <ChipGrid
            options={sizeOptions}
            selected={staged.size}
            onToggle={(value) =>
              setStaged((s) => ({ ...s, size: toggleValue(s.size, value) }))
            }
          />
        )}
      </FilterBarPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Price staging — chips + Min / Max inputs                            */
/* ------------------------------------------------------------------ */
/**
 * Combines the bucket chip grid with `$ Min – $ Max` inputs.
 * Single staged source of truth lives in the parent; this
 * component just routes user input back through `onChange`.
 *
 * Bucket clicks send the bucket's min/max upward; the inputs
 * (re)sync to whatever the staged values are now showing.
 * Typing in an input updates the staged value live and
 * automatically deselects any bucket pill that no longer
 * matches — no extra deselection wiring needed.
 *
 * Clamping happens at commit time (`sanitisePriceRange`), not
 * here — keeps the input forgiving (you can type a temporarily
 * invalid `9999` while you're still typing `999_9`).
 */
function PriceStaging({
  buckets,
  bounds,
  stagedMin,
  stagedMax,
  onChange,
}: {
  buckets: readonly PriceBucket[];
  bounds: PriceBounds | undefined;
  stagedMin: number | undefined;
  stagedMax: number | undefined;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const stagedMinStr = stagedMin === undefined ? "" : String(stagedMin);
  const stagedMaxStr = stagedMax === undefined ? "" : String(stagedMax);

  // Local string state so the user can type an in-flight number
  // ("" is a valid intermediate; so is "1" on the way to "15").
  // Resyncs from the staged values whenever they change
  // externally (bucket click, Reset). React-19-clean derived
  // state — no useEffect.
  const [inputMin, setInputMin] = useState(stagedMinStr);
  const [inputMax, setInputMax] = useState(stagedMaxStr);
  const [lastSyncedMin, setLastSyncedMin] = useState(stagedMinStr);
  const [lastSyncedMax, setLastSyncedMax] = useState(stagedMaxStr);
  if (stagedMinStr !== lastSyncedMin) {
    setLastSyncedMin(stagedMinStr);
    setInputMin(stagedMinStr);
  }
  if (stagedMaxStr !== lastSyncedMax) {
    setLastSyncedMax(stagedMaxStr);
    setInputMax(stagedMaxStr);
  }

  const handleInput = (kind: "min" | "max") => (raw: string) => {
    const next = raw.replace(/[^\d]/g, "");
    if (kind === "min") setInputMin(next);
    else setInputMax(next);
    const parsed = next === "" ? undefined : Number(next);
    if (kind === "min") {
      onChange(parsed, stagedMax);
    } else {
      onChange(stagedMin, parsed);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {buckets.length > 0 && (
        <ChipGrid
          options={buckets.map((b) => ({
            value: b.key,
            label: priceBucketLabel(b),
          }))}
          selected={buckets
            .filter((b) => {
              const min = b.isFirst ? undefined : b.min;
              const max = b.isLast ? undefined : b.max;
              return min === stagedMin && max === stagedMax;
            })
            .map((b) => b.key)}
          onToggle={(value) => {
            const bucket = buckets.find((b) => b.key === value);
            if (!bucket) return;
            const nextMin = bucket.isFirst ? undefined : bucket.min;
            const nextMax = bucket.isLast ? undefined : bucket.max;
            const alreadySelected =
              nextMin === stagedMin && nextMax === stagedMax;
            onChange(
              alreadySelected ? undefined : nextMin,
              alreadySelected ? undefined : nextMax,
            );
          }}
        />
      )}
      <div
        className={cn(
          "flex items-center gap-3 pt-1",
          buckets.length > 0 &&
            "border-t border-[color:var(--color-border)] pt-4",
        )}
      >
        <PriceInput
          label="Minimum price"
          value={inputMin}
          placeholder={bounds ? `Min $${bounds.minDollars}` : "Min"}
          onChange={handleInput("min")}
        />
        <span
          aria-hidden
          className="text-sm text-[color:var(--color-ink-muted)]"
        >
          –
        </span>
        <PriceInput
          label="Maximum price"
          value={inputMax}
          placeholder={bounds ? `Max $${bounds.maxDollars}` : "Max"}
          onChange={handleInput("max")}
        />
      </div>
    </div>
  );
}

/**
 * Small `$ NNN` number input. Inline because it has no other
 * caller — keeps the search-filters surface readable instead of
 * shipping a one-off component into `components/ui`.
 */
function PriceInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative flex-1">
      <span
        aria-hidden
        className={cn(
          "absolute left-3 top-1/2 -translate-y-1/2",
          "text-sm text-[color:var(--color-ink-muted)]",
          // Show the $ stronger when the field has a value so it
          // reads as "this is dollars" instead of decoration.
          value && "text-[color:var(--color-ink)]",
        )}
      >
        $
      </span>
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 w-full rounded-lg pl-7 pr-3 text-sm",
          "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
          "border-2 border-[color:var(--color-border-strong)]",
          "transition-colors duration-150",
          "focus:border-[color:var(--color-ink)] focus:outline-none",
          "placeholder:text-[color:var(--color-ink-muted)]",
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chip grid — shared staging UI for every large filter                */
/* ------------------------------------------------------------------ */
/**
 * Wraps a flat list of options as a wrap-flowing grid of pill
 * chips with the outline-variant styling. Same look for
 * Category, Price-bucket, and Size so the panels feel like
 * one cohesive system instead of three custom UIs.
 */
function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="px-1 py-2 text-sm text-[color:var(--color-ink-muted)]">
        No options available.
      </p>
    );
  }
  return (
    <div
      role="group"
      className="flex max-h-72 flex-wrap gap-2 overflow-y-auto p-1"
    >
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            aria-pressed={active}
            className={pillClasses(active, "outline")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option derivations                                                  */
/* ------------------------------------------------------------------ */

function useCategoryOptions(
  facets: SearchFacets | undefined,
  categories: readonly TaxonomyCategory[],
) {
  return useMemo(() => {
    // Prefer the facet map — it only lists subcategories that
    // actually exist in the current result set.
    if (facets?.subcategory && Object.keys(facets.subcategory).length > 0) {
      return Object.keys(facets.subcategory)
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    // Fallback: flatten the static taxonomy (used pre-facets and
    // when the upstream is briefly degraded).
    const names = Array.from(
      new Set(
        categories.flatMap((c) => c.subcategories.map((s) => s.name)),
      ),
    ).sort();
    return names.map((name) => ({ value: name, label: name }));
  }, [facets, categories]);
}

/**
 * Returns the absolute (min, max) **dollar** bounds across the
 * current result set, or `undefined` when the upstream didn't
 * surface a price facet at all.
 *
 * Salespace returns these in cents — floor / ceil keeps the
 * inputs' placeholders honest (the displayed value never
 * exceeds the precision the upstream guarantees).
 */
function usePriceBounds(
  facets: SearchFacets | undefined,
): PriceBounds | undefined {
  return useMemo(() => {
    const p = facets?.price;
    if (!p) return undefined;
    return {
      minDollars: Math.floor(p.min / 100),
      maxDollars: Math.ceil(p.max / 100),
    };
  }, [facets]);
}

/**
 * Turns the upstream `price.buckets` map (keys like `"0-50"`,
 * `"50-100"`, …, `"500-9999"`) into a sorted list of buckets,
 * each tagged with `isFirst` / `isLast` to drive the
 * "Under $X" / "Over $X" label flavour.
 *
 * `isFirst` / `isLast` are tagged conservatively:
 *
 *   - `isFirst` only when the bottom bucket truly starts at 0.
 *     A `"15-50"` bucket isn't really "Under $50" — it has a
 *     real floor we'd hide by relabelling.
 *   - `isLast` only when the top bucket extends past $500.
 *     Anything under $500 is treated as a real `$min – $max`
 *     ceiling; flipping it to "Over $X" would mis-describe
 *     where the catalog actually ends (and "Over $50" on a
 *     catalog that tops out at $80 sounds limitless when it
 *     isn't). $500 is the threshold zepr uses upstream when
 *     building its top-end bucket — keep the same cliff.
 */
function usePriceBuckets(facets: SearchFacets | undefined): PriceBucket[] {
  return useMemo(() => {
    const buckets = facets?.price?.buckets;
    if (!buckets) return [];
    const parsed = Object.keys(buckets)
      .map((key) => {
        const m = key.match(/^(\d+)-(\d+)$/);
        if (!m) return null;
        return { key, min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.min - b.min);
    return parsed.map((b, i) => ({
      ...b,
      isFirst: i === 0 && b.min === 0,
      isLast: i === parsed.length - 1 && b.max >= 500,
    }));
  }, [facets]);
}

function useSizeOptions(facets: SearchFacets | undefined) {
  return useMemo(() => {
    const sizes = facets?.["options.Size"];
    if (!sizes) return [];
    return Object.keys(sizes)
      .map((name) => ({ value: name, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [facets]);
}

/* ------------------------------------------------------------------ */
/* Labelling                                                           */
/* ------------------------------------------------------------------ */

function priceLabel(min: number | undefined, max: number | undefined): string {
  if (min === undefined && max === undefined) return "Price";
  if (min === undefined && max !== undefined) return `Price: Under $${max}`;
  if (min !== undefined && max === undefined) return `Price: Over $${min}`;
  return `Price: $${min} – $${max}`;
}

function priceBucketLabel(b: PriceBucket): string {
  if (b.isFirst) return `Under $${b.max}`;
  if (b.isLast) return `Over $${b.min}`;
  return `$${b.min} – $${b.max}`;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

function toggleValue(arr: readonly string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function parsePrice(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Snap a user-entered (min, max) pair to a shape the upstream
 * can actually use. Three things happen, in order:
 *
 *   1. **Swap if inverted.** If the user typed `min > max`,
 *      they almost always just put the values in the wrong
 *      fields (e.g. `min=130, max=20` when the intent was the
 *      `$20–$130` range). Swap first so the rest of the
 *      sanitiser sees their *intent*, not their typo.
 *   2. **Clamp into the facet range with a one-dollar inset
 *      at the opposite edge:**
 *
 *        - min clamps into `[facetMin, facetMax − 1]`
 *        - max clamps into `[facetMin + 1, facetMax]`
 *
 *      The inset matters because the closed-state label reads
 *      single-sided values as exclusive (`Over $X` means
 *      "more than $X"). Letting min sit at the facet max would
 *      render "Over $maxFacet" — a range with zero products in
 *      it. Pulling min down to `facetMax − 1` (and max up to
 *      `facetMin + 1`) keeps the boundary case selecting the
 *      edge product and the label honest. Overflowing values
 *      get capped into the same inset range.
 *   3. **Drop both if the pair collapsed to a single point.**
 *      Nothing useful to filter on.
 *
 * Returns `undefined` for either side that should be omitted
 * from the URL (a friendly null-equivalent that
 * `params.set(...)` callers can branch on).
 */
function sanitisePriceRange(
  min: number | undefined,
  max: number | undefined,
  bounds: PriceBounds | undefined,
): { min: number | undefined; max: number | undefined } {
  let cleanMin = min;
  let cleanMax = max;

  // 1. Swap first — recovers the intent of a flipped pair
  // *before* we apply asymmetric clamping (insets differ for
  // min vs max). Without this, `130 / 20` would inset 130 into
  // 123 as if it were a min, then swap, hiding the true
  // intent (`$20–$130`, max capped to 124).
  if (
    cleanMin !== undefined &&
    cleanMax !== undefined &&
    cleanMin > cleanMax
  ) {
    [cleanMin, cleanMax] = [cleanMax, cleanMin];
  }

  // 2. Inset-clamp.
  if (bounds) {
    const { minDollars, maxDollars } = bounds;
    // When the facet exposes a single price point (min === max)
    // there's no useful inset — fall back to flat clamping so
    // we don't produce an inverted [floor, floor − 1] range.
    const hasRange = maxDollars > minDollars;
    const minUpper = hasRange ? maxDollars - 1 : maxDollars;
    const maxLower = hasRange ? minDollars + 1 : minDollars;
    if (cleanMin !== undefined) {
      cleanMin = Math.min(Math.max(cleanMin, minDollars), minUpper);
    }
    if (cleanMax !== undefined) {
      cleanMax = Math.min(Math.max(cleanMax, maxLower), maxDollars);
    }
  }

  // 3. Collapse to "no filter" if the pair landed on a single
  // point (e.g. user typed 50/50, or a narrow facet inset
  // collapsed an inverted clamp).
  if (
    cleanMin !== undefined &&
    cleanMax !== undefined &&
    cleanMin === cleanMax
  ) {
    return { min: undefined, max: undefined };
  }
  return { min: cleanMin, max: cleanMax };
}
