"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { submitReviewAction } from "@/app/products/[handle]/reviews/actions";
import {
  CharCount,
  FormField,
  formInputClasses,
} from "@/components/ui/form-field";
import { MediaFormModal } from "@/components/ui/media-form-modal";
import { cn } from "@/lib/utils";

/**
 * "Write a review" CTA + the submit modal.
 *
 * The modal is a thin wrapper over `<MediaFormModal>`, the
 * generic submit-modal scaffold shared with future surfaces
 * (returns, contact). All of the reusable behaviour — file
 * picking, loading→success overlay, modal close/reset cadence,
 * inline error display — lives in the wrapper. This file only
 * owns:
 *
 *   - the rating + text-field state (caller-controlled so
 *     character counters and the StarPicker have something to
 *     bind to)
 *   - the submit-button gate (required-field completeness)
 *   - the action call + post-success `router.refresh()`
 *   - the review-specific `<StarPicker>` itself
 *
 * Field shape: hidden `<input name="rating">` sits next to the
 * visual `<StarPicker>` so `new FormData(form)` picks the value
 * up automatically — no manual FormData assembly anywhere in
 * the call site.
 */

/* Headline-shape caps — match the conventions e-commerce review
 * systems converge on (Yotpo / Loox / Amazon all land in this
 * range). Long enough that no real shopper hits the limit
 * naturally, short enough that the public review card stays
 * scannable. Display name lands in the "real-name" range —
 * anything longer is almost always a handle or a free-form
 * comment that doesn't belong in the byline. */
const MAX_TITLE = 80;
const MAX_BODY = 1500;
const MAX_NICKNAME = 40;

export interface WriteReviewButtonProps {
  productId: string;
  productHandle: string;
  /** Pre-fill for the nickname input — the shopper's first name
   *  from the session, where present. Editable. */
  defaultNickname?: string;
  /** Hide the visual trigger while keeping this component mounted.
   *  Set to true when `ownReviewExists` flips true mid-session
   *  (i.e. right after a successful submit) so the modal's
   *  success-flash window isn't cut short by the parent unmounting
   *  this island. The modal itself stays alive and finishes its
   *  close animation cleanly. */
  hideTrigger?: boolean;
}

export function WriteReviewButton({
  productId,
  productHandle,
  defaultNickname,
  hideTrigger = false,
}: WriteReviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary self-start"
        >
          Write a review
        </button>
      )}
      <ReviewFormModal
        open={open}
        onClose={() => setOpen(false)}
        productId={productId}
        productHandle={productHandle}
        defaultNickname={defaultNickname}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

function ReviewFormModal({
  open,
  onClose,
  productId,
  productHandle,
  defaultNickname,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productHandle: string;
  defaultNickname?: string;
}) {
  const router = useRouter();

  /* Default to a five-star pick. Shoppers writing a review
   * skew positive — the average sits north of 4.5 across
   * almost every category — so prefilling the maximum saves
   * the happy path one extra tap and keeps the action's
   * `rating >= 1` gate satisfied from the first render. */
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /* Seed the nickname from the session-derived default. The
   * prop is stable for the lifetime of the PDP render (the auth
   * projection re-resolves on navigation, not mid-session), so
   * `useState` with an initial value is enough — no effect
   * needed to re-sync. The reset path below also goes back to
   * this same default. */
  const [nickname, setNickname] = useState(defaultNickname ?? "");

  /* Submit gate — server re-validates these exact rules too,
   * but disabling the button is the cleaner UX signal. */
  const submitDisabled =
    rating < 1 || body.trim().length === 0 || nickname.trim().length === 0;

  return (
    <MediaFormModal
      open={open}
      onClose={onClose}
      title="Write a review"
      className="max-w-xl"
      submitLabel="Post review"
      disableSubmit={submitDisabled}
      onSubmit={(formData) =>
        submitReviewAction({ productId, productHandle }, formData)
      }
      onSuccess={() => router.refresh()}
      onReset={() => {
        setRating(5);
        setTitle("");
        setBody("");
        setNickname(defaultNickname ?? "");
      }}
      media={{}}
      loadingLabel="Posting your review…"
      successLabel="Review posted!"
    >
      {({ disabled }) => (
        <>
          <StarPicker value={rating} onChange={setRating} disabled={disabled} />
          {/* StarPicker buttons are `type="button"`, so the rating
           *  doesn't reach FormData on its own. A hidden mirror
           *  input lets the wrapper's `new FormData(form)` pick
           *  it up like any other field. */}
          <input type="hidden" name="rating" value={rating} />

          <FormField label="Title (optional)">
            <input
              type="text"
              name="title"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value.slice(0, MAX_TITLE))
              }
              maxLength={MAX_TITLE}
              disabled={disabled}
              placeholder="Game changer!"
              className={formInputClasses}
            />
            <CharCount value={title.length} max={MAX_TITLE} />
          </FormField>

          <FormField label="Your review">
            <textarea
              name="body"
              value={body}
              onChange={(event) =>
                setBody(event.target.value.slice(0, MAX_BODY))
              }
              rows={4}
              disabled={disabled}
              placeholder="What did you love? What could be better?"
              className={cn(formInputClasses, "resize-none")}
              required
            />
            <CharCount value={body.length} max={MAX_BODY} />
          </FormField>

          <FormField label="Display name">
            <input
              type="text"
              name="nickname"
              value={nickname}
              onChange={(event) =>
                setNickname(event.target.value.slice(0, MAX_NICKNAME))
              }
              maxLength={MAX_NICKNAME}
              disabled={disabled}
              placeholder="How should we show your name?"
              className={formInputClasses}
              required
            />
            <CharCount value={nickname.length} max={MAX_NICKNAME} />
          </FormField>
        </>
      )}
    </MediaFormModal>
  );
}

/* ------------------------------------------------------------------ */
/* Star picker (review-specific)                                        */
/* ------------------------------------------------------------------ */

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      disabled={disabled}
      aria-label="Rating"
    >
      <legend className="text-sm font-medium text-[color:var(--color-ink)]">
        Rating
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= value;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand)]",
                disabled
                  ? "opacity-60"
                  : "hover:bg-[color:var(--color-hover)]",
              )}
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  active
                    ? "fill-[color:var(--color-brand)] text-[color:var(--color-brand)]"
                    : "fill-transparent text-[color:var(--color-border-strong)]",
                )}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.99l-4.12 2.17.79-4.58L1.34 6.33l4.6-.67L8 1.5z" />
    </svg>
  );
}
