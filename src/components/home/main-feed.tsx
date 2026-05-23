import { Suspense } from "react";
import { MainFeedTabs } from "@/components/home/main-feed-tabs";
import { ProductCard } from "@/components/products/product-card";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/products/product-grid";
import { ViewMoreButton } from "@/components/products/view-more-button";
import {
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
import { PRODUCTS_PAGE_SIZE, parsePageParam } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";

/**
 * Homepage main product feed.
 *
 * Composes the (URL-backed) tab strip with a `<Suspense>`-streamed
 * product grid. The fetching lives in a private `MainFeedContent`
 * async component below — keeps that concern next to the tab logic
 * (it's the only thing that turns a tab id into products) while
 * letting the public `MainFeed` stay synchronous so it can render
 * the tabs and the suspense fallback eagerly.
 *
 * The Suspense boundary is keyed on `tab` only — switching tabs
 * unmounts the previous grid and mounts the skeleton. Within a
 * tab, page changes (via `<ViewMoreButton>`) flow through
 * `useTransition`, so React holds the existing grid in view
 * while the larger payload streams in — no skeleton flash on
 * "view more".
 */
const ABOVE_FOLD_TILES = 10;

export function MainFeed({
  tabParam,
  pageParam,
}: {
  tabParam?: string;
  pageParam?: string;
}) {
  const tab: MainFeedTabId = parseMainFeedTab(tabParam ?? null);
  const page = parsePageParam(pageParam);

  return (
    <section aria-label="Featured products" className="flex flex-col gap-6">
      <MainFeedTabs />
      <Suspense key={tab} fallback={<ProductGridSkeleton />}>
        <MainFeedContent tab={tab} page={page} />
      </Suspense>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Private — tab + page → products → grid + view-more                  */
/* ------------------------------------------------------------------ */

async function MainFeedContent({
  tab,
  page,
}: {
  tab: MainFeedTabId;
  page: number;
}) {
  const tabConfig = MAIN_FEED_TABS.find((t) => t.id === tab);

  // "View more" semantics: each page accumulates. We fetch
  // `page × PAGE_SIZE` in one upstream call so a refresh on
  // `?page=3` re-renders the same 60 cards the user had loaded.
  // One request per render keeps the network surface flat — no
  // N-way fan-out as the user clicks deeper.
  const limit = page * PRODUCTS_PAGE_SIZE;
  const result = await searchProducts(
    { sort: tabConfig?.sort, limit },
    // Per-tab cache tag so a future webhook can revalidate one
    // tab without nuking the others.
    { tags: [`products:${tab}`] },
  );

  if (result.hits.length === 0) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 text-center"
      >
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          No products to show right now.
        </p>
      </div>
    );
  }

  const hasMore = result.hits.length < result.total;

  return (
    <div
      role="tabpanel"
      aria-label={`${tabConfig?.label ?? "Products"} grid`}
      className="flex flex-col gap-8"
    >
      <ProductGrid>
        {result.hits.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            eager={i < ABOVE_FOLD_TILES}
          />
        ))}
      </ProductGrid>
      <ViewMoreButton hasMore={hasMore} />
    </div>
  );
}
