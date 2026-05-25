import Link from "next/link";
import { DeleteReviewButton } from "@/components/products/delete-review-button";
import { ReviewMediaGrid } from "@/components/products/review-media-grid";
import { WriteReviewButton } from "@/components/products/write-review-button";
import { RatingChip } from "@/components/ui/rating-chip";
import type { AuthState } from "@/lib/auth/session";
import type {
  ProductReview,
  ProductReviewSummary,
} from "@/lib/reviews/types";
import { cn } from "@/lib/utils";

/**
 * Reviews body for the PDP accordion.
 *
 * Mostly presentational — it receives an already-fetched
 * `ProductReviewSummary` (or `null` for "no reviews yet") plus
 * the resolved `AuthState`, so this file knows nothing about
 * the review provider currently wired up. Swap the provider
 * behind `lib/reviews/index.ts` and this surface stays identical.
 *
 * Render tree:
 *
 *   - Review list      — first page from the provider, newest
 *                        first (the dispatcher pre-sorts so the
 *                        UI never reorders). Each row's title
 *                        line:
 *                            ★ 5.0 · Game Changer! · Your review
 *
 *                        The "Your review" badge + a Delete
 *                        affordance only appear when the
 *                        provider matched the row to the
 *                        signed-in shopper (`review.isOwn`).
 *
 *   - Write-review CTA — signed-in: opens the submit modal
 *                        (`<WriteReviewButton>`). Signed-in
 *                        shopper who's already reviewed: a
 *                        "delete-to-rewrite" hint. Guest: link
 *                        to sign-in.
 *
 * The two client islands (`<WriteReviewButton>` and
 * `<DeleteReviewButton>`) are the only client-side JS in this
 * subtree — everything else stays server-rendered.
 *
 * The aggregate `★ 4.5 (24)` chip lives in the accordion title
 * aside — no in-panel summary header, no duplication.
 *
 * Section-level gating ("hide entirely when guest + no reviews")
 * lives in the PDP route, NOT here, so this component can stay
 * focused on rendering whatever it's handed.
 */

export interface ProductReviewsProps {
  productId: string;
  productHandle: string;
  productTitle: string;
  summary: ProductReviewSummary | null;
  authState: AuthState;
  /** True when the signed-in shopper has actually purchased this
   *  product (verified server-side via the Customer Account API
   *  before render). Drives the "eligible to write a review" UI
   *  — false hides every write affordance, even for signed-in
   *  shoppers, so we never advertise a CTA the submit gate would
   *  bounce. */
  canWriteReview: boolean;
}

export function ProductReviews({
  productId,
  productHandle,
  productTitle,
  summary,
  authState,
  canWriteReview,
}: ProductReviewsProps) {
  const hasReviews = !!summary && summary.totalCount > 0;
  /* Shopper has already reviewed this product — provider stamps
   * `isOwn: true` on the matching row when we hand it the
   * viewer email. We use that flag to suppress the "Write a
   * review" CTA (the duplicate-check would just bounce them)
   * and to reveal the delete affordance on the matching row. */
  const ownReviewExists =
    hasReviews && summary.reviews.some((r) => r.isOwn);

  return (
    <div className="flex flex-col gap-6">
      {hasReviews ? (
        <ReviewList
          reviews={summary.reviews}
          totalCount={summary.totalCount}
          productId={productId}
        />
      ) : canWriteReview ? (
        /* Empty-state copy is "eligible UI" — only the shopper
         *  who can actually post a review sees it. Non-purchasers
         *  with no reviews never reach this branch because the
         *  PDP gates the whole section away. */
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          Be the first to share your thoughts on {productTitle}.
        </p>
      ) : null}

      <WriteReviewSection
        authState={authState}
        productId={productId}
        productHandle={productHandle}
        canWriteReview={canWriteReview}
        ownReviewExists={ownReviewExists}
        /* Top hairline only when there's content above to
         *  separate from. Without it, the accordion's own
         *  title-to-body divider sits right above us and a
         *  second border would read as a double rule.
         *
         *  Content above is either the review list (`hasReviews`)
         *  or the "Be the first to share" empty-state copy
         *  (`canWriteReview && !hasReviews`, which collapses
         *  to `canWriteReview` once we factor in the other arm). */
        withSeparator={hasReviews || canWriteReview}
      />
    </div>
  );
}

/* ---------- Review list ---------- */

function ReviewList({
  reviews,
  totalCount,
  productId,
}: {
  reviews: ReadonlyArray<ProductReview>;
  totalCount: number;
  productId: string;
}) {
  return (
    <div>
      <ul className="divide-y divide-[color:var(--color-border)]">
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} productId={productId} />
        ))}
      </ul>
      {reviews.length < totalCount && (
        <p className="pt-4 text-xs text-[color:var(--color-ink-muted)]">
          Showing {reviews.length} of {totalCount}
        </p>
      )}
    </div>
  );
}

function ReviewRow({
  review,
  productId,
}: {
  review: ProductReview;
  productId: string;
}) {
  const date = new Date(review.createdAt);
  const dateLabel = isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  return (
    <li className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
      {/* Title line: rating chip · review title · (optional)
       *  verified pill. `items-center` instead of baseline so
       *  the SVG star (no glyph baseline of its own) sits
       *  vertically centred against the title text, not riding
       *  high above it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <RatingChip value={review.rating} />
        {review.title && (
          <>
            <span
              aria-hidden
              className="text-[color:var(--color-ink-muted)]"
            >
              ·
            </span>
            <h4 className="text-sm font-semibold text-[color:var(--color-ink)]">
              {review.title}
            </h4>
          </>
        )}
        {review.isOwn && (
          <span className="inline-flex items-center rounded-full bg-[color:var(--color-brand-light)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-brand)]">
            Your review
          </span>
        )}
        {review.verifiedPurchase && (
          <span className="inline-flex items-center rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-success)]">
            Verified purchase
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[color:var(--color-ink)]">
        {review.body}
      </p>

      {review.media && review.media.length > 0 && (
        <ReviewMediaGrid
          media={review.media}
          altPrefix={review.title ?? `Review by ${review.authorName}`}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[color:var(--color-ink-muted)]">
          <span className="font-medium text-[color:var(--color-ink)]">
            {review.authorName}
          </span>
          {dateLabel && <span> · {dateLabel}</span>}
        </p>
        {review.isOwn && (
          <DeleteReviewButton productId={productId} reviewId={review.id} />
        )}
      </div>
    </li>
  );
}

/* ---------- Write-review CTA ---------- */

function WriteReviewSection({
  authState,
  productId,
  productHandle,
  canWriteReview,
  ownReviewExists,
  withSeparator,
}: {
  authState: AuthState;
  productId: string;
  productHandle: string;
  canWriteReview: boolean;
  ownReviewExists: boolean;
  withSeparator: boolean;
}) {
  /* Guest — send them through Shopify login and bounce back to
   * *this* PDP afterwards. The prompt is honest for guests since
   * they might actually be past purchasers who just haven't
   * signed in yet. `encodeURIComponent` covers any handle with
   * query-reserved characters; the login route re-validates
   * that the decoded value starts with `/` before honouring it
   * (open-redirect defence). */
  if (!authState.isLoggedIn) {
    const loginHref = `/account/login?return_to=${encodeURIComponent(
      `/products/${productHandle}`,
    )}`;
    return (
      <HintBox withSeparator={withSeparator}>
        <Link
          href={loginHref}
          className="font-semibold text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-brand)]"
        >
          Sign in
        </Link>{" "}
        to write a review.
      </HintBox>
    );
  }

  /* Already reviewed — quiet acknowledgement. The delete
   * affordance on the matching row is the only write surface
   * they need, so we keep this to one short line and skip the
   * paternalistic "delete to rewrite" instruction. */
  if (ownReviewExists) {
    return (
      <HintBox withSeparator={withSeparator}>
        You&rsquo;ve already reviewed this product.
      </HintBox>
    );
  }

  /* Signed in but not a purchaser — surface the eligibility
   * hint instead of a button the submit gate would just reject.
   * Matches the wording the server action uses for the same
   * condition so the message stays consistent across surfaces. */
  if (!canWriteReview) {
    return (
      <HintBox withSeparator={withSeparator}>
        You can only review products you&rsquo;ve purchased.
      </HintBox>
    );
  }

  /* Eligible + no own review: the real CTA. The submit action
   * re-validates auth + purchase + duplicate as defence-in-depth;
   * the gate here is just so the affordance only shows when the
   * action would actually succeed. */
  return (
    <div
      className={cn(
        withSeparator &&
          "border-t border-[color:var(--color-border)] pt-4",
      )}
    >
      <WriteReviewButton
        productId={productId}
        productHandle={productHandle}
        defaultNickname={authState.customerName ?? undefined}
      />
    </div>
  );
}

/* Shared shell for the hint variants — keeps the muted-copy
 * styling identical so the section bottom reads as one coherent
 * slot regardless of which message lands there. The top
 * separator only paints when there's content above to divide
 * from; without it the accordion's own title-to-body hairline
 * would stack against ours and read as a double rule. */
function HintBox({
  children,
  withSeparator,
}: {
  children: React.ReactNode;
  withSeparator: boolean;
}) {
  return (
    <div
      className={cn(
        "text-sm text-[color:var(--color-ink-muted)]",
        withSeparator && "border-t border-[color:var(--color-border)] pt-4",
      )}
    >
      {children}
    </div>
  );
}
