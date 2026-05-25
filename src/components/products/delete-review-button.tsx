"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteReviewAction } from "@/app/products/[handle]/reviews/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * "Delete review" affordance — only rendered on the shopper's
 * own review row.
 *
 * One small client island so the rest of the review row stays
 * server-rendered. Opens the shared `ConfirmDialog` and routes
 * the confirm through the matching server action.
 *
 * Identity is taken from the session inside the action, not
 * passed from the client — the `reviewId` on its own is not
 * enough to delete anyone else's review (the action's Supabase
 * filter scopes to `customer->>email` on the session shopper),
 * but we still keep the affordance hidden from anyone the
 * provider didn't tag as the author.
 */
export interface DeleteReviewButtonProps {
  productId: string;
  reviewId: string;
}

export function DeleteReviewButton({
  productId,
  reviewId,
}: DeleteReviewButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteReviewAction({ productId, reviewId });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-[color:var(--color-ink-secondary)] transition-colors hover:text-[color:var(--color-danger)]"
      >
        Delete
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          /* Clear any stale error after the dialog has closed so
           * the next open starts clean. */
          setTimeout(() => setError(null), 200);
        }}
        onConfirm={handleConfirm}
        title="Delete your review?"
        description={
          error ? (
            <span className="text-[color:var(--color-danger)]">{error}</span>
          ) : (
            "This will permanently remove your review and any attached photos or videos."
          )
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        tone="danger"
        pending={pending}
      />
    </>
  );
}
