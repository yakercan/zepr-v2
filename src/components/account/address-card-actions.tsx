"use client";

import { useActionState, useState, useTransition } from "react";
import type { AddressActionState } from "@/app/account/addresses/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Card footer for one saved address — the row that carries the
 * mutation entry points ("Set as default" and "Delete"). Edit
 * lives at the card's top-right corner, rendered by the parent
 * card layout, so this footer stays narrowly scoped to the two
 * stateful mutations.
 *
 * Layout:
 *
 *   - "Set as default" sits at the *left* edge of the footer
 *     (positive / promote action) and is omitted entirely on
 *     the row that's already the default.
 *   - "Delete" anchors the *right* edge — destructive, last
 *     element the eye reaches.
 *
 * Button language:
 *
 *   - Both buttons share the same baseline ink-secondary resting
 *     state + hover transition language as the dashboard
 *     "Sign out" link. Delete's hover ramps to the danger token
 *     so the destructive intent only reveals on intent.
 *   - The native `confirm()` was replaced with `<ConfirmDialog>`
 *     so the prompt matches the rest of the app's modal
 *     dialect; the dialog also disables itself + swaps the
 *     button label to "Deleting…" while the mutation is in
 *     flight, which the native prompt couldn't.
 *
 * State plumbing:
 *
 *   - Two `useActionState` calls — one per mutation — keep each
 *     row's pending / error fully isolated. Both errors share
 *     one inline message slot below the row.
 *   - `useTransition` is required because the action is called
 *     imperatively from a click handler (after the confirm
 *     prompt) instead of through a `<form action={…}>` boundary.
 */
export interface AddressCardActionsProps {
  isDefault: boolean;
  deleteAction: (
    prev: AddressActionState,
  ) => Promise<AddressActionState>;
  setDefaultAction: (
    prev: AddressActionState,
  ) => Promise<AddressActionState>;
}

const INITIAL_STATE: AddressActionState = { status: "idle" };

/* Shared resting/hover language for the row's tertiary action
 * links + buttons. Same dialect as the dashboard "Sign out"
 * link — quiet ink-secondary base, ramps to ink (neutral) on
 * hover, with the danger variant ramping to red instead so the
 * destructive cue only fires on intent. Kept as plain string
 * constants so siblings stay byte-identical without a tiny
 * wrapper component. */
const ROW_LINK_BASE =
  "text-sm font-semibold text-[color:var(--color-ink-secondary)] transition-colors disabled:opacity-60";
const ROW_LINK_NEUTRAL = `${ROW_LINK_BASE} hover:text-[color:var(--color-ink)]`;
const ROW_LINK_DANGER = `${ROW_LINK_BASE} hover:text-[color:var(--color-danger)]`;

export function AddressCardActions({
  isDefault,
  deleteAction,
  setDefaultAction,
}: AddressCardActionsProps) {
  const [deleteState, runDelete, deletePending] = useActionState(
    deleteAction,
    INITIAL_STATE,
  );
  const [defaultState, runSetDefault, defaultPending] = useActionState(
    setDefaultAction,
    INITIAL_STATE,
  );
  const [, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const error =
    deleteState.status === "error"
      ? deleteState.error
      : defaultState.status === "error"
        ? defaultState.error
        : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        {/* Left slot — "Set as default" lives here. Empty
            placeholder div for the already-default row keeps
            `justify-between` pushing the right cluster to the
            edge without an `ml-auto` hack. */}
        <div className="min-h-[1.25rem]">
          {!isDefault && (
            <button
              type="button"
              onClick={() => startTransition(() => runSetDefault())}
              disabled={defaultPending}
              aria-disabled={defaultPending}
              className={ROW_LINK_NEUTRAL}
            >
              {defaultPending ? "Setting…" : "Set as default"}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={deletePending}
          aria-disabled={deletePending}
          className={ROW_LINK_DANGER}
        >
          {deletePending ? "Deleting…" : "Delete"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="text-right text-xs text-[color:var(--color-danger)]"
        >
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          /* Close the prompt immediately and fire the mutation
           * in the background. The list revalidates on success
           * (the row vanishes) and any error surfaces inline
           * via the `error` slot above. */
          setConfirmOpen(false);
          startTransition(() => runDelete());
        }}
        title="Delete this address?"
        description="This can't be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        tone="danger"
        pending={deletePending}
      />
    </div>
  );
}
