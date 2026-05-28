/**
 * Canonical catalog of privacy-request types the shopper can
 * submit through `/privacy-request`.
 *
 * Mirrors the request shape the legacy storefront used (see
 * `app/components/legal/OptOutContent.tsx` and
 * `app/routes/policies.opt-out.tsx` in the old repo) but
 * relocated to a typed TS catalog instead of inline form
 * markup — same pattern as `CONTACT_SUBJECTS`. The form binds
 * to the entries here; the action validates against the same
 * ids so the trust boundary speaks one schema across client
 * and server.
 *
 * Legal context (U.S. state laws — no GDPR, we don't ship to
 * the EU yet): California CCPA/CPRA, Colorado CPA, Virginia
 * VCDPA, Connecticut CTDPA, Utah UCPA, Texas TDPSA, Florida
 * FDBR, and a handful of others all share the same family of
 * consumer rights — opt out of sale/sharing, opt out of
 * marketing, correct, access, delete. We expose all five so
 * one form covers every applicable state without a per-state
 * fork.
 *
 * `tag` is the umbrella label on the support-notification
 * email's subject line (`[Privacy] …`) so support's inbox
 * filters can pick all privacy traffic out of the firehose
 * without per-type sub-tags. The specific request types live
 * in the email body.
 */

export type PrivacyRequestTypeId =
  | "do-not-sell-or-share"
  | "marketing-unsubscribe"
  | "correct"
  | "access"
  | "delete";

export interface PrivacyRequestType {
  id: PrivacyRequestTypeId;
  /** Bold primary line on the checkbox — matches the CCPA-
   *  required link text wording for the opt-out entry. */
  label: string;
  /** Muted secondary line on the checkbox — one sentence,
   *  shopper-facing, no legalese. */
  description: string;
}

export const PRIVACY_REQUEST_TYPES: ReadonlyArray<PrivacyRequestType> = [
  {
    id: "do-not-sell-or-share",
    label: "Do not sell or share my personal information",
    description:
      "Restrict how we share your information with third parties for marketing, targeted advertising, or analytics.",
  },
  {
    id: "marketing-unsubscribe",
    label: "Unsubscribe from marketing emails",
    description:
      "Stop receiving promotional emails and marketing communications.",
  },
  {
    id: "correct",
    label: "Correct my information",
    description:
      "Request that we fix or update personal data we hold about you.",
  },
  {
    id: "access",
    label: "Access my information",
    description:
      "Request the categories of personal information we collect and the specific pieces we maintain about you.",
  },
  {
    id: "delete",
    label: "Delete my personal information",
    description:
      "Request deletion of personal information we have collected about you.",
  },
];

/** Lookup helper so server-side validation can resolve a
 *  shopper-submitted id to the canonical entry without
 *  exposing the array's internal order. */
export function findPrivacyRequestType(
  id: string,
): PrivacyRequestType | undefined {
  return PRIVACY_REQUEST_TYPES.find((type) => type.id === id);
}
