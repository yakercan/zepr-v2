import Link from "next/link";
import { ReviewMediaGrid } from "@/components/products/review-media-grid";
import { RatingChip } from "@/components/ui/rating-chip";
import type { AuthState } from "@/lib/auth/session";
import type {
  ProductReview,
  ProductReviewSummary,
} from "@/lib/reviews/types";

/**
 * Reviews body for the PDP accordion.
 *
 * Pure presentation. Receives an already-fetched
 * `ProductReviewSummary` (or `null` for "no reviews yet") plus
 * the resolved `AuthState`, so this file knows nothing about
 * the review provider currently wired up — swap Salespace /
 * Judge.me / Yotpo behind `lib/reviews/index.ts` and the UI
 * stays identical.
 *
 * Render tree:
 *
 *   - Review list       — first page from the provider, newest
 *                         first (the dispatcher pre-sorts so
 *                         the UI never reorders).
 *                         Each row's title line:
 *                            ★ 5.0 · Game Changer!
 *   - Write-review CTA  — signed-in: enabled stub (the actual
 *                         form lands in a later round); guest:
 *                         link to sign-in.
 *
 * The aggregate `★ 4.5 (24)` chip lives in the accordion title
 * aside — no in-panel summary header, no duplication.
 *
 * Section-level gating ("hide entirely when guest + no reviews")
 * lives in the PDP route, NOT here, so this component can stay
 * focused on rendering whatever it's handed.
 */

export interface ProductReviewsProps {
  productTitle: string;
  summary: ProductReviewSummary | null;
  authState: AuthState;
}

export function ProductReviews({
  productTitle,
  summary,
  authState,
}: ProductReviewsProps) {
  const hasReviews = !!summary && summary.totalCount > 0;

  return (
    <div className="flex flex-col gap-6">
      {hasReviews ? (
        <ReviewList reviews={summary.reviews} totalCount={summary.totalCount} />
      ) : (
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          Be the first to share your thoughts on {productTitle}.
        </p>
      )}

      <WriteReviewSection authState={authState} />
    </div>
  );
}

/* ---------- Review list ---------- */

function ReviewList({
  reviews,
  totalCount,
}: {
  reviews: ReadonlyArray<ProductReview>;
  totalCount: number;
}) {
  return (
    <div>
      <ul className="divide-y divide-[color:var(--color-border)]">
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} />
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

function ReviewRow({ review }: { review: ProductReview }) {
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
        {review.verifiedPurchase && (
          <span className="inline-flex items-center rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-success)]">
            Verified purchase
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[color:var(--color-ink)]">
        {review.body}
      </p>

      {review.images && review.images.length > 0 && (
        <ReviewMediaGrid
          images={review.images}
          altPrefix={review.title ?? `Review by ${review.authorName}`}
        />
      )}

      <p className="text-xs text-[color:var(--color-ink-muted)]">
        <span className="font-medium text-[color:var(--color-ink)]">
          {review.authorName}
        </span>
        {dateLabel && <span> · {dateLabel}</span>}
      </p>
    </li>
  );
}

/* ---------- Write-review CTA ---------- */

function WriteReviewSection({ authState }: { authState: AuthState }) {
  /* Signed-in: a primary CTA stubbed for now — the actual write
   * form lands in a later round; wiring it up here just means
   * swapping the `disabled` button below for an `onClick` that
   * opens the form modal (which then routes through the
   * provider's submit endpoint via `lib/reviews/index.ts`). */
  if (authState.isLoggedIn) {
    return (
      <div className="border-t border-[color:var(--color-border)] pt-4">
        <button
          type="button"
          className="btn-secondary self-start"
          disabled
          aria-disabled
          title="Coming soon"
        >
          Write a review
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--color-border)] pt-4 text-sm text-[color:var(--color-ink-muted)]">
      <Link
        href="/account/sign-in"
        className="font-semibold text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-brand)]"
      >
        Sign in
      </Link>{" "}
      to write a review.
    </div>
  );
}
