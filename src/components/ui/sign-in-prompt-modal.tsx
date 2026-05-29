"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useIsCompact } from "@/components/device/device-provider";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";

/**
 * Reusable "you need to sign in to do this" modal.
 *
 * Drop-in primitive for any logged-out interaction that we
 * deliberately gate behind auth — the immediate caller is the
 * favorite (heart) button, which decided in spec that guests
 * can't save items because the persistence model requires a
 * known shopper identity (no device-id wishlist in v2). Future
 * use cases that fit the same shape are easy to add (cart-add
 * gating, write-review prompt outside the PDP flow, etc.).
 *
 * Reuses the shared overlay shells so stacking, escape-to-close,
 * body scroll lock, focus management, and animation come for free;
 * this component just owns the copy + the two action buttons. On
 * touch devices it renders as a bottom `<Sheet>` (drag-to-dismiss
 * drawer) and on desktop as a centered `<Modal>` — the same
 * device-branch pattern the cart / size-chart / product modals use.
 *
 * `returnTo` round-trip:
 *
 *   - Reads the current pathname + query so it can build a
 *     `/account/login?return_to=…` URL that lands the shopper
 *     back exactly where they were after signing in.
 *   - Both the Sign-in and Create-account buttons hit the same
 *     login route (Shopify's OAuth handshake supports new-account
 *     signup natively from the same `/account/login` redirect),
 *     so we don't need two server routes; the visual two-CTA
 *     shape is purely a UX convention.
 *
 * Sized as a small dialog (`max-w-sm`) — auth prompts are
 * intentionally compact so they read as a friendly nudge, not a
 * page takeover.
 */

export interface SignInPromptModalProps {
  open: boolean;
  onClose: () => void;
  /** Heading copy. Falls back to a generic prompt when omitted. */
  title?: string;
  /** Body copy explaining *why* the shopper should sign in. The
   *  caller writes the surface-specific reason ("Save your
   *  favorites across devices", "Add to cart and keep your bag
   *  for next time", …). */
  message?: string;
}

export function SignInPromptModal({
  open,
  onClose,
  title = "Sign in to continue",
  message = "Sign in to your account or create one in a few seconds.",
}: SignInPromptModalProps) {
  const isCompact = useIsCompact();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* Build the post-login destination from the *current* URL so
   * the modal works on any page — no caller has to know the
   * route shape. Query string is preserved so a shopper toggling
   * favorites on `/search?q=hoodie&page=2` lands back on that
   * same result page after login, not on the bare `/search`
   * landing.
   *
   * Memoised because `useSearchParams` returns a fresh
   * `URLSearchParams` instance on every render and `pathname`
   * is otherwise effectively static across a page life. */
  const loginHref = useMemo(() => {
    const qs = searchParams.toString();
    const returnTo = qs ? `${pathname}?${qs}` : pathname;
    return `/account/login?return_to=${encodeURIComponent(returnTo)}`;
  }, [pathname, searchParams]);

  const body = (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-secondary)]">
        {message}
      </p>

      {/* Stacked CTA pair — primary fills full width, secondary
       *  sits below at the same footprint. Vertical stack reads
       *  better than a side-by-side pair on a narrow surface and
       *  matches how the account dropdown presents its sign-in /
       *  register choices. Both destinations are the same OAuth
       *  route — Shopify's login UI lets the shopper switch between
       *  sign-in and account-creation on the next screen. */}
      <div className="flex flex-col gap-2">
        <Link href={loginHref} className="btn-primary w-full">
          Sign in
        </Link>
        <Link href={loginHref} className="btn-secondary w-full">
          Create account
        </Link>
      </div>
    </div>
  );

  /* Touch → bottom drawer; desktop → centered dialog. Only the
   * matching branch mounts (the `<Sheet>` self-short-circuits to
   * `null` above `xl`, and we gate the `<Modal>` the other way),
   * so there's no double render or focus competition. */
  if (isCompact) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={title}
        className="px-5 pb-5 pt-2"
      >
        {body}
      </Sheet>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-sm"
      ariaLabel={title}
    >
      <div className="p-5 md:p-6">{body}</div>
    </Modal>
  );
}
