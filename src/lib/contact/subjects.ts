/**
 * Subject categories surfaced in the contact form dropdown.
 *
 * One typed catalogue + helper so the client (rendering the
 * `<Select>` options) and the server action (validating the
 * submitted id and routing the email subject line) never drift.
 * Add or rename categories here and both sides pick it up
 * automatically.
 *
 * Ordering is by likelihood of selection — order issues are the
 * single biggest support driver for storefronts, so they lead.
 * "Other" sits last for the same reason it sits last in every
 * dropdown ever: it's the fallback bucket.
 */

export interface ContactSubject {
  id: string;
  /** Dropdown label the shopper sees. */
  label: string;
  /** Prefix appended to the email subject line ("[Order]
   *  Customer Subject" etc.) so the support inbox can filter /
   *  thread by category without parsing the body. */
  tag: string;
}

export const CONTACT_SUBJECTS = [
  {
    id: "order",
    label: "Order issue (refund, returns, missing items)",
    tag: "Order",
  },
  {
    id: "shipping",
    label: "Shipping & tracking",
    tag: "Shipping",
  },
  {
    id: "product",
    label: "Product question",
    tag: "Product",
  },
  {
    id: "wholesale",
    label: "Wholesale & partnerships",
    tag: "Wholesale",
  },
  {
    id: "bug",
    label: "Website bug or issue",
    tag: "Bug",
  },
  {
    id: "other",
    label: "Other",
    tag: "Other",
  },
] as const satisfies ReadonlyArray<ContactSubject>;

export type ContactSubjectId = (typeof CONTACT_SUBJECTS)[number]["id"];

/**
 * Resolve a raw subject id (from `FormData`) to its full record,
 * or `null` for an unknown id. Mirrors the lookup helpers in
 * `lib/returns/reasons.ts` so the server-action shape stays
 * familiar — `findX(...)` returning the full record or null is
 * the same dialect across modules.
 */
export function findContactSubject(id: string): ContactSubject | null {
  return CONTACT_SUBJECTS.find((s) => s.id === id) ?? null;
}
