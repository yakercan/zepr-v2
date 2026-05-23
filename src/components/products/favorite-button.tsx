"use client";

import { type MouseEvent } from "react";
import { HeartIcon } from "@/components/ui/icons";
import { toggleFavorite, useIsFavorited } from "@/lib/favorites/store";
import { MEDIA_OVERLAY_BUBBLE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Favorite (wishlist) toggle pinned to the top-right of a product
 * card's media tile.
 *
 * Visibility rules:
 *
 *   - **Idle, not favorited** — hidden (`opacity-0`). The card
 *     stays visually clean until the user signals intent by
 *     hovering.
 *   - **Card hover, not favorited** — fades in via the parent
 *     `<Link>`'s `group` so any hover anywhere on the card
 *     surfaces the affordance.
 *   - **Favorited (anytime)** — stays at full opacity even
 *     without hover. The whole point of favoriting is at-a-glance
 *     "I've already saved this", so hiding it on idle would
 *     defeat the purpose.
 *
 * Visual states:
 *
 *   - Outline heart by default (matches the rest of the card's
 *     restrained look).
 *   - Filled brand-pink heart when favorited — Tailwind's
 *     `fill-current` overrides the SVG `fill="none"` attribute
 *     via CSS specificity, so no separate icon variant needed.
 *   - Slight color shift on button hover (`hover:text-rose-300`)
 *     hints the click affordance without competing with the
 *     filled state.
 *
 * Event semantics: the parent `<Link>` wraps everything, so we
 * `preventDefault` + `stopPropagation` to keep the click local
 * (no navigation to PDP, no bubble to other handlers).
 */
export function FavoriteButton({ productId }: { productId: string }) {
  const favorited = useIsFavorited(productId);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(productId);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        MEDIA_OVERLAY_BUBBLE_CLASSES,
        // Named group so the heart icon can scale on button-hover
        // regardless of where exactly the cursor sits inside the
        // bubble — direct `hover:` on the icon would miss when
        // the cursor is on the bubble corner.
        "group/heart absolute right-2 top-2",
        // Bubble bg holds steady on hover — the affordance lives
        // on the heart (color + scale), not on the chrome.
        // Override the shared bubble's `hover:bg-black/55` back
        // to the rest tint.
        "hover:bg-black/35",
        // Visibility: hidden by default, fades in on whole-card
        // hover. `group-hover` (unnamed) reads the *card-level*
        // group, not `group/media`, so hovering the title / price
        // row also reveals the heart.
        "opacity-0 group-hover:opacity-100",
        // …unless already favorited — then always visible.
        favorited && "opacity-100",
        // Heart colour: white at rest, brand-secondary (pink) on
        // hover. When favorited, the secondary tint is permanent
        // — hover stays steady so the toggle reads as "stuck"
        // rather than re-triggerable.
        favorited
          ? "text-[color:var(--color-secondary)]"
          : "hover:text-[color:var(--color-secondary)]",
      )}
    >
      <HeartIcon
        className={cn(
          // Heart sits a notch larger than other overlay glyphs
          // (video indicator's h-4) because it's the brand
          // statement of the card — the affordance the user
          // actually wants to find.
          "h-[18px] w-[18px] transition-transform duration-150",
          // Slight pop on hover so the affordance feels alive
          // without the bubble moving with it. Filled-state heart
          // stays steady at its natural size — the toggle is
          // "done", no need to invite more clicks.
          favorited ? "fill-current" : "fill-none group-hover/heart:scale-110",
        )}
      />
    </button>
  );
}
