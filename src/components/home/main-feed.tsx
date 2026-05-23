import { MainFeedTabs } from "@/components/home/main-feed-tabs";

/**
 * Homepage main product feed.
 *
 * Composes the tab strip + (soon) the products grid. Kept as a thin
 * server component so the route file (`app/page.tsx`) doesn't have
 * to know about the internal pieces — once the grid lands, only this
 * file changes.
 *
 * Tabs are URL-backed; the grid will read the same `?tab` param so
 * the two stay in sync without a shared context.
 */
export function MainFeed() {
  return (
    <section aria-label="Featured products" className="flex flex-col gap-6">
      <MainFeedTabs />
      {/* Products grid lands here in the next iteration. */}
    </section>
  );
}
