/**
 * Predefined return reasons.
 *
 * We don't use Shopify's `returnReasonDefinitions` (or the legacy
 * `ReturnReason` enum names) on the customer-facing surface — the
 * reasons here are tighter and read more clearly than Shopify's
 * defaults. Every submitted reason maps to a single Shopify enum
 * (`OTHER`) on the wire and is encoded into the `customerNote`
 * field so the merchant still sees what the shopper picked:
 *
 *   customerNote = "Damaged or defective: [optional elaboration]"
 *
 * That keeps us decoupled from Shopify's taxonomy without losing
 * fidelity for the merchant.
 *
 * Media policy is encoded per-reason:
 *
 *   - `mediaRequired: true`  → submission gated on ≥ 1 attachment
 *     (the modal also marks the picker with `*`).
 *   - `mediaRequired: false` → media is optional.
 *
 * "Other" carries a freeform-note requirement (the modal gates
 * submit on the elaboration field being non-empty when "Other"
 * is selected for any line).
 */

export type ReturnReasonId =
  | "damaged_or_defective"
  | "wrong_item"
  | "missing_item"
  | "not_as_described"
  | "arrived_late"
  | "other";

export interface ReturnReason {
  id: ReturnReasonId;
  label: string;
  /** Whether at least one photo or video must be attached to the
   *  request when this reason is selected for any line item. */
  mediaRequired: boolean;
  /** Whether the per-line elaboration note becomes mandatory when
   *  this reason is picked. Only `other` flips this on — every
   *  other reason carries enough meaning on its own. */
  noteRequired: boolean;
}

export const RETURN_REASONS: readonly ReturnReason[] = [
  {
    id: "damaged_or_defective",
    label: "Damaged or defective",
    mediaRequired: true,
    noteRequired: false,
  },
  {
    id: "wrong_item",
    label: "Wrong item received",
    mediaRequired: true,
    noteRequired: false,
  },
  {
    id: "missing_item",
    label: "Missing item / package",
    mediaRequired: false,
    noteRequired: true,
  },
  {
    id: "not_as_described",
    label: "Doesn’t match description",
    mediaRequired: true,
    noteRequired: true,
  },
  {
    id: "arrived_late",
    label: "Arrived too late",
    mediaRequired: false,
    noteRequired: false,
  },
  {
    id: "other",
    label: "Other",
    mediaRequired: false,
    noteRequired: true,
  },
];

/** Lookup helper — `null` for an unknown id (treated as a
 *  validation failure by the server action). */
export function findReturnReason(id: string): ReturnReason | null {
  return RETURN_REASONS.find((r) => r.id === id) ?? null;
}

/** Per-line note cap — long enough for a useful elaboration,
 *  short enough that the modal stays compact. Server validates
 *  this; the textarea uses it via `maxLength`. */
export const MAX_RETURN_NOTE = 280;

/** Build the `customerNote` we send Shopify for one line. The
 *  reason name is always first so the merchant's return queue
 *  reads cleanly without expanding each row; the note (if any)
 *  follows after a colon. */
export function buildShopifyNote(
  reason: ReturnReason,
  note: string,
): string {
  const trimmed = note.trim();
  return trimmed.length > 0
    ? `${reason.label}: ${trimmed}`
    : reason.label;
}
