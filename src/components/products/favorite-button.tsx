"use client";

import { type MouseEvent, useOptimistic, useState, useTransition } from "react";

import { toggleFavoriteAction } from "@/app/favorites/actions";
import { HeartIcon } from "@/components/ui/icons";
import { SignInPromptModal } from "@/components/ui/sign-in-prompt-modal";
import { MEDIA_OVERLAY_BUBBLE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Favorite (wishlist) toggle pinned to the top-right of a product
 * card's media tile.
 *
 * State + persistence model — v2 redesign:
 *
 *   - **Logged-in shoppers** own the canonical state on
 *     Salespace's wishlist endpoint — the same backend the
 *     legacy storefront used, kept as the single source of
 *     truth (cross-device sync, like-count aggregation, future
 *     analytics all live there). The card renders with the
 *     saved state on first paint (server-fetched per grid),
 *     clicks fire `toggleFavoriteAction` to persist, and
 *     `useOptimistic` flips the heart immediately so the UI
 *     feels instant even on slow connections. On failure the
 *     optimistic flip rolls back and the heart returns to its
 *     persisted state.
 *   - **Guests** never persist. Clicking the heart opens
 *     `<SignInPromptModal>` so the affordance is still there
 *     but acts as a friendly conversion nudge instead of a
 *     silently-local toggle. The intent is conversion-driven,
 *     not just "we deleted features": with a real account the
 *     wishlist travels across devices, syncs across sessions,
 *     and powers everything we layer on top later.
 *
 * The legacy v1 storefront tried to bridge both worlds with a
 * device-id wishlist + a `/wishlist/link` merge on login. That
 * pipeline had real bugs (dual-state desync on the wishlist
 * page, race conditions, never-called migration paths). Forcing
 * sign-in collapses every one of those problems and unlocks
 * cross-device persistence by default.
 *
 * Visibility rules (unchanged from v1):
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
  /** Shopify product id. Salespace search returns numeric ids
   *  on `SearchProduct.id` (the form cards have on hand) and
   *  the Shopify Storefront returns GIDs on `ProductDetail.id`.
   *  Either form is accepted — the server action coerces to
   *  numeric at the Salespace boundary. */
  productId: string;
  /** Server-fetched initial state. `false` for guests
   *  (their set is always empty). */
  initiallyFavorited: boolean;
  /** Drives the guest branch (open sign-in modal) vs the
   *  logged-in branch (persist via server action). Passed down
   *  from the server parent that already had to call
   *  `getAuthState()`; no need to re-read the session on the
   *  client. */
  isLoggedIn: boolean;
}

export function FavoriteButton({
  productId,
  initiallyFavorited,
  isLoggedIn,
}: FavoriteButtonProps) {
  /* `useOptimistic` keeps the heart visually in sync with the
   * shopper's intent before the action resolves. The "real"
   * value is `initiallyFavorited` for guests (always the
   * server-rendered state) and a `useState`-tracked value for
   * logged-in shoppers (so toggles within the same page life
   * persist across re-renders). */
  const [persistedFavorited, setPersistedFavorited] =
    useState(initiallyFavorited);
  const [optimisticFavorited, setOptimisticFavorited] = useOptimistic(
    persistedFavorited,
  );
  const [, startTransition] = useTransition();
  const [signInOpen, setSignInOpen] = useState(false);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      setSignInOpen(true);
      return;
    }

    const next = !optimisticFavorited;
    startTransition(async () => {
      setOptimisticFavorited(next);
      const result = await toggleFavoriteAction({
        productId,
        favorited: next,
      });
      if (result.ok) {
        /* Persist the new state to the local "real" value so
         *  subsequent re-renders read from it. `useOptimistic`
         *  auto-syncs back to the new base on the next render
         *  after the transition completes. */
        setPersistedFavorited(result.favorited);
      } else if (result.error === "auth_required") {
        /* Session expired between page load and click — surface
         *  the same modal a fresh-guest click would have. The
         *  `useOptimistic` rollback on transition end takes
         *  care of returning the heart to its persisted (false)
         *  state. */
        setSignInOpen(true);
      }
      /* `internal_error` falls through silently — the optimistic
       * value rolls back, the heart returns to its persisted
       * state, and the shopper can retry. We deliberately don't
       * pop a toast for this; favorites failing is a low-stakes
       * miss and a noisy error UI on a hover-revealed icon would
       * read as broken. */
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={optimisticFavorited}
        aria-label={
          optimisticFavorited ? "Remove from favorites" : "Add to favorites"
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
          /* …unless already favorited — then always visible. */
          optimisticFavorited && "opacity-100",
          /* Heart colour: white at rest, brand-secondary (pink)
           * on hover. When favorited the secondary tint is
           * permanent — hover stays steady so the toggle reads
           * as "stuck" rather than re-triggerable. */
          optimisticFavorited
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
             * heart stays steady at its natural size — the
             * toggle is "done", no need to invite more clicks. */
            optimisticFavorited
              ? "fill-current"
              : "fill-none group-hover/heart:scale-110",
          )}
        />
      </button>

      {/* Sign-in modal — mounted alongside so its open/close
       *  lifecycle survives parent re-renders. Same pattern as
       *  the WriteReviewButton + ReturnRequestButton. */}
      <SignInPromptModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        title="Sign in to save favorites"
        message="Save items to your favorites and keep them across devices when you sign in or create an account."
      />
    </>
  );
}
