import { Suspense } from "react";
import { MainFeedTabs } from "@/components/home/main-feed-tabs";
import { ProductCard } from "@/components/products/product-card";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/products/product-grid";
import {
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
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
 * The Suspense boundary is keyed on `tab` so switching tabs unmounts
 * the previous grid and mounts the skeleton — the user never sees
 * stale cards while the new ones load.
 */
const ABOVE_FOLD_TILES = 10;

export function MainFeed({ tabParam }: { tabParam?: string }) {
  const tab: MainFeedTabId = parseMainFeedTab(tabParam ?? null);

  return (
    <section aria-label="Featured products" className="flex flex-col gap-6">
      <MainFeedTabs />
      <Suspense key={tab} fallback={<ProductGridSkeleton />}>
        <MainFeedContent tab={tab} />
      </Suspense>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Private — tab → products → grid                                     */
/* ------------------------------------------------------------------ */

async function MainFeedContent({ tab }: { tab: MainFeedTabId }) {
  const tabConfig = MAIN_FEED_TABS.find((t) => t.id === tab);
  const result = await searchProducts(
    { sort: tabConfig?.sort, limit: 24 },
    // Per-tab cache tag so a future webhook can revalidate one tab
    // without nuking the others.
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

  return (
    <div
      role="tabpanel"
      aria-label={`${tabConfig?.label ?? "Products"} grid`}
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
    </div>
  );
}
