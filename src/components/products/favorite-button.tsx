"use client";

import { type MouseEvent, useState } from "react";

import { toggleFavoriteAction } from "@/app/favorites/actions";
import { HeartIcon } from "@/components/ui/icons";
import { SignInPromptModal } from "@/components/ui/sign-in-prompt-modal";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import {
  markFavorited,
  markUnfavorited,
  useIsFavorited,
} from "@/lib/favorites/store";
import { MEDIA_OVERLAY_BUBBLE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Favorite (wishlist) toggle pinned to the top-right of a product
 * card's media tile.
 *
 * State + persistence model — v2 redesign:
 *
 *   - **Logged-in shoppers** own the canonical state on Salespace's
 *     wishlist endpoint. The card mounts with the server-rendered
 *     `initiallyFavorited` flag (matches the SSR HTML), then
 *     switches to reading the shared favorites store so every
 *     surface (header badge, twin cards, `/favorites` grid) stays
 *     in sync after a click. The click handler flips the store
 *     synchronously and fires the server action without an
 *     `await` — the UI is fully decoupled from the network
 *     round-trip, exactly like the salespace storefront's
 *     optimistic watchlist toggle. On failure we roll back the
 *     store; every consumer rolls back with it.
 *   - **Guests** never persist. Clicking the heart opens
 *     `<SignInPromptModal>` so the affordance is still there but
 *     acts as a friendly conversion nudge.
 *
 * Why read favorited state from the shared store (instead of
 * local `useState`)?
 *
 *   The previous design tracked `favorited` per-button. That made
 *   the heart instant on click but left every other consumer
 *   (header badge, twin card on another rail, the `/favorites`
 *   grid) blind to the mutation until the next server render. The
 *   store inverts that — one mutation, every subscriber re-renders
 *   the slice they care about. Per-button perf is identical because
 *   `useIsFavorited` selects a primitive boolean; the card only
 *   re-renders when *this* product's status flips.
 *
 * Visibility rules:
 *
 *   - Idle, not favorited → hidden (`opacity-0`); revealed on
 *     card hover via the parent `<Link>`'s `group`.
 *   - Favorited → always visible at full opacity so saved items
 *     are scannable in a grid.
 *
 * Event semantics: the parent `<Link>` wraps everything, so we
 * `preventDefault` + `stopPropagation` to keep the click local
 * (no navigation to PDP, no bubble to other handlers).
 */

export interface FavoriteButtonProps {
  /** Shopify product id. Salespace search returns numeric ids on
   *  `SearchProduct.id` (the form cards have on hand) and the
   *  Shopify Storefront returns GIDs on `ProductDetail.id`.
   *  Either form is accepted — the server action coerces to
   *  numeric at the Salespace boundary. */
  productId: string;
  /** Server-fetched initial state. `false` for guests (their set
   *  is always empty). Matches the SSR HTML so the first paint
   *  doesn't flicker, then we hand off to the store. */
  initiallyFavorited: boolean;
  /** Drives the guest branch (open sign-in modal) vs the logged-
   *  in branch (persist via server action). Passed down from the
   *  server parent that already had to call `getAuthState()`;
   *  no need to re-read the session on the client. */
  isLoggedIn: boolean;
}

export function FavoriteButton({
  productId,
  initiallyFavorited,
  isLoggedIn,
}: FavoriteButtonProps) {
  /* First paint reads the server prop (matches SSR), then we
   * hand off to the store. The store is seeded by the header's
   * `FavoritesBadge` which runs on every navigation, so by the
   * first post-hydration commit it already carries the truth. */
  const hydrated = useHydrated();
  const storeFavorited = useIsFavorited(productId);
  const favorited = hydrated ? storeFavorited : initiallyFavorited;
  const [signInOpen, setSignInOpen] = useState(false);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      setSignInOpen(true);
      return;
    }

    const next = !favorited;

    /* Synchronous flip — store mutation fans out to every
     * subscriber (header badge, twin cards, favorites grid) on
     * the very next commit. No transition queue, no awaited
     * network. */
    if (next) markFavorited(productId);
    else markUnfavorited(productId);

    /* Fire-and-forget. We only re-touch the store on rollback
     * paths; the happy path's `revalidatePath("/favorites")`
     * from the action runs server-side and doesn't need us to
     * await. */
    toggleFavoriteAction({ productId, favorited: next })
      .then((result) => {
        if (result.ok) return;
        /* Roll back — every consumer rolls back with us. */
        if (next) markUnfavorited(productId);
        else markFavorited(productId);
        if (result.error === "auth_required") {
          /* Session expired between page load and click —
           * surface the same modal a fresh-guest click would
           * have. */
          setSignInOpen(true);
        }
        /* `internal_error` falls through silently — favorites
         * failing is a low-stakes miss and a noisy error UI on
         * a hover-revealed icon would read as broken. */
      })
      .catch(() => {
        /* Network blew up entirely (offline, server abort).
         * Same rollback as a logical failure above. */
        if (next) markUnfavorited(productId);
        else markFavorited(productId);
      });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={favorited}
        aria-label={
          favorited ? "Remove from favorites" : "Add to favorites"
        }
        className={cn(
          MEDIA_OVERLAY_BUBBLE_CLASSES,
          /* Named group so the heart icon can scale on button-
           * hover regardless of where exactly the cursor sits
           * inside the bubble — direct `hover:` on the icon
           * would miss when the cursor is on the bubble corner. */
          "group/heart absolute right-2 top-2",
          /* Bubble bg holds steady on hover — the affordance
           * lives on the heart (color + scale), not the chrome.
           * Override the shared bubble's `hover:bg-black/55`. */
          "hover:bg-black/35",
          /* Hidden by default, fades in on whole-card hover. */
          "opacity-0 group-hover:opacity-100",
          /* On mobile there's no hover to reveal it — and a
           * saved-items affordance you can't tap is just clutter.
           * The `touch:` variant (anchored to `html[data-device=
           * "mobile"]`) forces the heart fully visible at rest. */
          "touch:opacity-100",
          /* …unless already favorited — then always visible on
           * desktop too. */
          favorited && "opacity-100",
          /* Heart colour: white at rest, brand-secondary (pink)
           * on hover. When favorited the secondary tint is
           * permanent — hover stays steady so the toggle reads
           * as "stuck" rather than re-triggerable. */
          favorited
            ? "text-[color:var(--color-secondary)]"
            : "hover:text-[color:var(--color-secondary)]",
        )}
      >
        <HeartIcon
          className={cn(
            /* Heart sits a notch larger than other overlay
             * glyphs (video indicator's h-4) because it's the
             * brand statement of the card. */
            "h-[18px] w-[18px] transition-transform duration-150",
            /* Slight pop on hover so the affordance feels alive
             * without the bubble moving with it. Filled-state
             * heart stays steady — the toggle is "done", no
             * need to invite more clicks. */
            favorited
              ? "fill-current"
              : "fill-none group-hover/heart:scale-110",
          )}
        />
      </button>

      {/* Sign-in prompt — mounted alongside so its open/close
       *  lifecycle survives parent re-renders.
       *
       *  The `display:contents` span that stops click propagation is
       *  load-bearing: the prompt opens via a portal (Vaul sheet /
       *  `<Modal>` createPortal), so in the *DOM* its clicks stop at
       *  `document.body` — but in *React's* tree the prompt is still a
       *  child of this button, which lives inside the product card's
       *  `<Link>`. Without this guard a backdrop tap to dismiss would
       *  bubble through the React tree to the anchor and navigate to
       *  the PDP. Same discipline the card-level `<AddToCartButton>`
       *  applies to its `<ProductModal>`; `contents` keeps the span
       *  out of layout while staying in the tree for event delegation. */}
      <span className="contents" onClick={(e) => e.stopPropagation()}>
        <SignInPromptModal
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          title="Sign in to save favorites"
          message="Save items to your favorites and keep them across devices when you sign in or create an account."
        />
      </span>
    </>
  );
}
