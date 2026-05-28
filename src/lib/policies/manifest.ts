/**
 * Catalog of every page under `/policies`. Drives:
 *
 *   - The `/policies` index page (titles + summaries + URLs).
 *   - The "Last updated" stamp at the top of each policy.
 *   - The cross-policy footer nav at the bottom of each page
 *     ("View privacy policy / cookie policy / terms" links).
 *
 * Why a separate manifest instead of co-locating with the
 * content components: the index page and the policy footer
 * need lightweight metadata (title, summary, last-updated date)
 * without pulling in the heavy doc components. Manifest is a
 * data file every route can import freely.
 *
 * **Last-updated discipline.** Each policy's `lastUpdated`
 * field is an explicit ISO date the team bumps when the doc's
 * actual content changes — *not* `new Date()`. Legal docs
 * displaying today's date despite no edits mislead users into
 * thinking the policy was just reviewed. When you edit a doc,
 * update its date here.
 */

export type PolicyHandle =
  | "privacy-policy"
  | "cookie-policy"
  | "terms-conditions"
  | "opt-out";

export interface PolicyManifestEntry {
  handle: PolicyHandle;
  /** Page H1 + browser tab title. */
  title: string;
  /** Page sub-header summary — one sentence, shopper-facing. */
  summary: string;
  /** ISO date string (YYYY-MM-DD). Bump on every content edit. */
  lastUpdated: string;
}

export const POLICY_MANIFEST: ReadonlyArray<PolicyManifestEntry> = [
  {
    handle: "privacy-policy",
    title: "Privacy policy",
    summary:
      "How Zepr collects, uses, and protects your personal information — plus the rights you have over it.",
    lastUpdated: "2026-05-28",
  },
  {
    handle: "cookie-policy",
    title: "Cookie policy",
    summary:
      "The cookies and similar technologies we use, why we use them, and how to manage your preferences.",
    lastUpdated: "2026-05-28",
  },
  {
    handle: "terms-conditions",
    title: "Terms & conditions",
    summary:
      "The rules that govern your use of Zepr — orders, shipping, returns, accounts, and more.",
    lastUpdated: "2026-05-28",
  },
  {
    handle: "opt-out",
    title: "Your privacy choices",
    summary:
      "Submit a request to opt out, unsubscribe, correct, access, or delete your personal information.",
    lastUpdated: "2026-05-28",
  },
];

/** Lookup by handle. Returns `undefined` when the handle isn't
 *  in the manifest (which should never happen for the static
 *  routes that bind directly to a manifest entry — but the
 *  index page filters / sorts off this list, so a lookup helper
 *  is useful for code that resolves a `PolicyHandle` value into
 *  display metadata). */
export function findPolicy(
  handle: PolicyHandle,
): PolicyManifestEntry | undefined {
  return POLICY_MANIFEST.find((entry) => entry.handle === handle);
}

/** Human-friendly date string for the "Last updated" stamp.
 *  Single source of truth so every policy page formats the
 *  date the same way. */
export function formatPolicyDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
