import Link from "next/link";

import {
  POLICY_MANIFEST,
  type PolicyHandle,
  type PolicyManifestEntry,
} from "@/lib/policies/manifest";

/**
 * "View other policies" footer nav shared across every page in
 * `/policies/*` (the three prose docs + the opt-out form).
 *
 * Filters the current page out so the shopper only sees
 * actionable destinations — landing on a policy and then
 * seeing "view this same policy" as a link looks broken.
 *
 * Sits below the main content with a hairline divider so the
 * page doesn't look like the prose keeps going.
 */
export function PolicyCrossNav({
  currentHandle,
  className,
}: {
  currentHandle?: PolicyHandle;
  className?: string;
}) {
  const others: ReadonlyArray<PolicyManifestEntry> = POLICY_MANIFEST.filter(
    (entry) => entry.handle !== currentHandle,
  );

  if (others.length === 0) return null;

  return (
    <nav
      aria-label="Other policies"
      className={
        className ??
        "mt-12 border-t border-[color:var(--color-border)] pt-6 md:mt-16"
      }
    >
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
        Other policies
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {others.map((entry) => (
          <li key={entry.handle}>
            <Link
              href={`/policies/${entry.handle}`}
              className="text-sm font-medium text-[color:var(--color-ink)] underline underline-offset-2 transition-colors hover:text-[color:var(--color-brand)]"
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
