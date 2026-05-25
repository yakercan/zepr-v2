"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { requestReturnAction } from "@/app/account/orders/[id]/return/actions";
import {
  CharCount,
  FormField,
  formInputClasses,
} from "@/components/ui/form-field";
import { MediaFormModal } from "@/components/ui/media-form-modal";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Select } from "@/components/ui/select";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import {
  MAX_RETURN_NOTE,
  RETURN_REASONS,
  findReturnReason,
  type ReturnReasonId,
} from "@/lib/returns/reasons";
import type { ReturnableLineItem } from "@/lib/shopify/customer-account-types";
import { cn } from "@/lib/utils";

/**
 * "Return request" trigger + modal.
 *
 * Renders the trigger link only — the modal is mounted alongside
 * so its open/close lifecycle survives parent re-renders (same
 * pattern `<WriteReviewButton>` uses on the PDP). The parent
 * decides whether to render this component at all based on
 * `returnableLineItems.length > 0`, so this island never has to
 * gate itself.
 *
 * Form shape:
 *
 *   - One row per returnable item. A checkbox opts the line in;
 *     unchecked lines are excluded from the request entirely.
 *   - Opted-in lines reveal a quantity stepper (only when
 *     `returnableQuantity > 1`), a reason dropdown, and an
 *     elaboration textarea (mandatory only for the "Other"
 *     reason — every other reason carries enough meaning on
 *     its own).
 *   - One shared media picker sits at the bottom — required
 *     whenever any opted-in line carries a reason that demands
 *     media (damaged / wrong item / not as described).
 *
 * Submission is wrapped in `<MediaFormModal>` so loading +
 * success states, the `disableSubmit` gate, the close/reset
 * cadence, and inline error rendering all come for free.
 */

export interface ReturnRequestButtonProps {
  orderId: string;
  items: ReturnableLineItem[];
}

interface LineDraft {
  selected: boolean;
  quantity: number;
  reasonId: ReturnReasonId | "";
  note: string;
}

/** Builds the initial per-line draft map. Every line starts
 *  unselected; quantity defaults to the full returnable amount
 *  so a shopper who flips the checkbox without touching the
 *  stepper returns all of it. */
function initialDrafts(items: ReturnableLineItem[]): Record<string, LineDraft> {
  const draft: Record<string, LineDraft> = {};
  for (const item of items) {
    draft[item.lineItemId] = {
      selected: false,
      quantity: item.returnableQuantity,
      reasonId: "",
      note: "",
    };
  }
  return draft;
}

export function ReturnRequestButton({
  orderId,
  items,
}: ReturnRequestButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    initialDrafts(items),
  );

  /* Aggregate validity + media policy across all selected lines.
   * Computed via `useMemo` because the modal re-renders on every
   * keystroke in any textarea — recomputing the same scan three
   * times per render adds up. */
  const summary = useMemo(() => {
    let selectedCount = 0;
    let mediaRequired = false;
    let anyInvalid = false;

    for (const item of items) {
      const d = drafts[item.lineItemId];
      if (!d?.selected) continue;
      selectedCount++;

      const reason = d.reasonId ? findReturnReason(d.reasonId) : null;
      if (!reason) {
        anyInvalid = true;
        continue;
      }
      if (reason.mediaRequired) mediaRequired = true;
      if (reason.noteRequired && d.note.trim().length === 0) {
        anyInvalid = true;
      }
    }

    return {
      selectedCount,
      mediaRequired,
      submitDisabled: selectedCount === 0 || anyInvalid,
    };
  }, [items, drafts]);

  const updateDraft = (id: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="link-muted"
      >
        Return request
      </button>

      <MediaFormModal
        open={open}
        onClose={() => setOpen(false)}
        title="Return request"
        className="max-w-2xl"
        submitLabel="Submit request"
        disableSubmit={summary.submitDisabled}
        onSubmit={(formData) =>
          requestReturnAction({ orderId }, formData)
        }
        onSuccess={() => router.refresh()}
        onReset={() => setDrafts(initialDrafts(items))}
        media={{ required: summary.mediaRequired }}
        loadingLabel="Submitting your request…"
        successLabel="Return requested!"
      >
        {({ disabled }) => (
          <>
            {/* Serialised line payload — the server action parses
             *  this as JSON. Storing the array in one hidden field
             *  sidesteps the `lines[i][...]` FormData bracket
             *  convention without dropping into a custom encoder. */}
            <input
              type="hidden"
              name="lines"
              value={JSON.stringify(
                items
                  .filter((item) => drafts[item.lineItemId]?.selected)
                  .map((item) => {
                    const d = drafts[item.lineItemId];
                    return {
                      lineItemId: item.lineItemId,
                      quantity: d.quantity,
                      reasonId: d.reasonId,
                      note: d.note,
                    };
                  }),
              )}
            />

            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <LineRow
                  key={item.lineItemId}
                  item={item}
                  draft={drafts[item.lineItemId]}
                  disabled={disabled}
                  onChange={(patch) =>
                    updateDraft(item.lineItemId, patch)
                  }
                />
              ))}
            </ul>
          </>
        )}
      </MediaFormModal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One returnable item row                                              */
/* ------------------------------------------------------------------ */

function LineRow({
  item,
  draft,
  disabled,
  onChange,
}: {
  item: ReturnableLineItem;
  draft: LineDraft;
  disabled: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
}) {
  const reason = draft.reasonId ? findReturnReason(draft.reasonId) : null;
  const noteRequired = reason?.noteRequired ?? false;
  const noteMissing =
    noteRequired && draft.note.trim().length === 0;

  return (
    <li
      className={cn(
        "rounded-lg border border-[color:var(--color-border)] p-3",
        draft.selected && "border-[color:var(--color-ink)]",
      )}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          disabled={disabled}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[color:var(--color-border-strong)] accent-[color:var(--color-brand)]"
        />

        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]">
          {item.imageUrl ? (
            <ShimmerImage
              src={item.imageUrl}
              alt={item.imageAlt ?? item.title}
              wrapperClassName="block h-full w-full"
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-[color:var(--color-ink)]">
            {item.title}
          </span>
          {item.variantTitle && item.variantTitle !== "Default Title" && (
            <span className="text-sm text-[color:var(--color-ink-muted)]">
              {item.variantTitle}
            </span>
          )}
          <span className="mt-0.5 text-xs text-[color:var(--color-ink-muted)]">
            {item.returnableQuantity === 1
              ? "1 available to return"
              : `${item.returnableQuantity} available to return`}
          </span>
        </div>
      </label>

      {/* Expanded controls — only render when this line is in
       *  the request. Keeps the modal compact for unselected
       *  rows and means we don't have to grey-out a half-page
       *  of irrelevant inputs. */}
      {draft.selected && (
        <div className="mt-3 flex flex-col gap-3 pl-7">
          {item.returnableQuantity > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[color:var(--color-ink)]">
                Returning
              </span>
              <QuantityStepper
                quantity={draft.quantity}
                onIncrement={() =>
                  onChange({
                    quantity: Math.min(
                      item.returnableQuantity,
                      draft.quantity + 1,
                    ),
                  })
                }
                onDecrement={() =>
                  onChange({ quantity: Math.max(1, draft.quantity - 1) })
                }
                max={item.returnableQuantity}
              />
              <span className="text-sm text-[color:var(--color-ink-muted)]">
                of {item.returnableQuantity}
              </span>
            </div>
          )}

          <FormField label="Reason" required>
            <Select
              options={RETURN_REASONS.map((r) => ({
                value: r.id,
                label: r.label,
              }))}
              value={draft.reasonId}
              onChange={(next) =>
                onChange({ reasonId: next as ReturnReasonId })
              }
              placeholder="Pick a reason"
              disabled={disabled}
            />
          </FormField>

          <FormField label="Add a note" required={noteRequired}>
            <textarea
              value={draft.note}
              onChange={(event) =>
                onChange({
                  note: event.target.value.slice(0, MAX_RETURN_NOTE),
                })
              }
              rows={2}
              maxLength={MAX_RETURN_NOTE}
              disabled={disabled}
              placeholder={
                noteRequired
                  ? "Please describe the issue."
                  : "Anything that would help us process this faster."
              }
              className={cn(formInputClasses, "resize-none")}
              required={noteRequired}
              aria-invalid={noteMissing}
            />
            <CharCount value={draft.note.length} max={MAX_RETURN_NOTE} />
          </FormField>
        </div>
      )}
    </li>
  );
}
