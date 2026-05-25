import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductCard } from "@/components/products/product-card";
import { ProductGrid } from "@/components/products/product-grid";
import { getSession } from "@/lib/auth/session";
import { getCurrentWishlist } from "@/lib/favorites/queries";
import type { FavoriteItem } from "@/lib/favorites/types";
import type { SearchProduct } from "@/types/product";

export const metadata: Metadata = {
  title: "Favorites",
};

/**
 * `/favorites` — the shopper's saved-products list.
 *
 * Server-rendered, auth-gated. Single Salespace round-trip per
 * request: the wishlist endpoint returns enriched product
 * snapshots (image, title, price, available) so each card can
 * paint directly from the wire data — no Shopify hydration
 * step, no fan-out by id.
 *
 * Auth gate: anonymous shoppers redirect to login with the
 * page-return baked in. The heart button itself prompts sign-in
 * via modal; this redirect catches direct navigation attempts.
 *
 * Three states for the body:
 *
 *   1. `null` from `getCurrentWishlist` after the auth gate
 *      → Salespace failed. Friendly retry banner.
 *   2. Empty array  → no saves yet. Empty state with a CTA back
 *      to browse.
 *   3. Items  → grid of cards. Heart starts filled (every card
 *      here is favorited by definition); un-saving leaves the
 *      card mounted until next navigation so undo works without
 *      a refresh.
 */
export default async function FavoritesPage() {
  /* `getSession` is React-cache-wrapped so this and any grid
   * the page renders share one decrypt. */
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent("/favorites")}`,
    );
  }

  const wishlist = await getCurrentWishlist();

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
            Favorites
          </h1>
          {wishlist && wishlist.length > 0 && (
            <p className="text-sm text-[color:var(--color-ink-muted)]">
              {wishlist.length}{" "}
              {wishlist.length === 1 ? "item" : "items"} saved
            </p>
          )}
        </div>
      </header>

      {wishlist === null ? (
        <UnavailableState />
      ) : wishlist.length === 0 ? (
        <EmptyState />
      ) : (
        <ProductGrid>
          {wishlist.map((item, i) => (
            <ProductCard
              key={item.productId}
              product={toSearchProduct(item)}
              eager={i < 10}
              /* Every card on this page is favorited by
               * definition — paint the heart filled on first
               * frame. */
              favorited
              isLoggedIn
            />
          ))}
        </ProductGrid>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Wire-shape adapter                                                   */
/* ------------------------------------------------------------------ */

/**
 * Project a `FavoriteItem` (Salespace wishlist snapshot) into
 * the `SearchProduct` shape `<ProductCard>` consumes.
 *
 * Salespace's wishlist endpoint returns a slimmer snapshot than
 * the search endpoint — no badges, no rating chip, no hover
 * media, no variant options. That's by design: the favorites
 * page is a personal collection (the shopper already decided to
 * save these), not a discovery surface, so social-proof
 * decoration is less load-bearing. Cards render with image +
 * title + price + add-to-cart; the visual stripping is silent.
 *
 * If we ever want the full enriched shape here, the path is a
 * follow-up Salespace search call that filters by handle list —
 * not a wholesale rework of this page.
 */
function toSearchProduct(item: FavoriteItem): SearchProduct {
  return {
    id: item.productId,
    handle: item.handle,
    title: item.title,
    image_url: item.imageUrl,
    price_min_cents: item.priceMinCents,
    price_max_cents: item.priceMaxCents,
    compare_at_min_cents: item.compareAtMinCents,
    currency: item.currency,
    available: item.available,
  };
}

/* ------------------------------------------------------------------ */
/* Empty / error states                                                 */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 px-6 text-center"
    >
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        You haven&apos;t saved any favorites yet. Tap the heart on a product
        you love and it&apos;ll show up here.
      </p>
      <Link href="/" className="btn-primary">
        Browse products
      </Link>
    </div>
  );
}

function UnavailableState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 px-6 text-center"
    >
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        We couldn&apos;t load your favorites right now. Please try again
        shortly.
      </p>
    </div>
  );
}
