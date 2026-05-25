import "server-only";

import type { Metadata } from "next";

import { FavoritesPageBody } from "@/components/favorites/favorites-page-body";
import { getCurrentWishlist } from "@/lib/favorites/queries";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Favorites",
};

/**
 * `/favorites` — the shopper's saved-products list.
 *
 * Server-rendered, auth-gated. Single Salespace round-trip per
 * request: the wishlist endpoint returns enriched product
 * snapshots (image, title, price, available) so each card can
 * paint directly from the wire data — no Shopify hydration,
 * no fan-out by id.
 *
 * Auth gate: anonymous shoppers redirect to login with the
 * page-return baked in. The heart button itself prompts sign-in
 * via modal; this redirect catches direct navigation attempts.
 *
 * Body lives in a client component (`<FavoritesPageBody>`) so
 * unfavoriting a card removes it on the next paint instead of
 * waiting for a navigation to bake the revalidation. The title
 * count and the empty state both flow from the same client store
 * the heart button mutates, so everything updates in lockstep.
 *
 * Two states this server shell handles directly:
 *
 *   - `null` from `getCurrentWishlist` → Salespace failed. Static
 *      retry banner, no client work.
 *   - Anything else (including empty array) → delegate to the
 *      client body, which decides between grid and empty state.
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

  if (wishlist === null) {
    return (
      <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-10">
          <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
            Favorites
          </h1>
        </header>
        <div
          role="status"
          className="flex flex-col items-center gap-4 py-16 px-6 text-center"
        >
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            We couldn&apos;t load your favorites right now. Please try again
            shortly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <FavoritesPageBody initialItems={wishlist} />
    </main>
  );
}
