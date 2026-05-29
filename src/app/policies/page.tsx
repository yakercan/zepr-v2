import type { Metadata } from "next";
import Link from "next/link";

import {
  POLICY_MANIFEST,
  formatPolicyDate,
} from "@/lib/policies/manifest";

/**
 * `/policies` — index of every legal document Zepr publishes.
 *
 * One destination for shoppers (or auditors) who want to find a
 * specific policy without hunting through the footer. Listed in
 * manifest order so editorial control over the running order
 * stays in `manifest.ts` rather than scattered across components.
 *
 * Each row mirrors the manifest: title, one-sentence summary,
 * and the "Last updated" stamp. No emojis, no decorative cards
 * — same plain-list dialect we use everywhere else in v2 (the
 * FAQ list, the account dashboard quick links, etc.).
 */
export const metadata: Metadata = {
  title: "Policies",
  description:
    "Read Zepr's privacy policy, cookie policy, terms & conditions, and submit a privacy request.",
  /* Legal/boilerplate — kept out of the index (no search value,
   *  and we don't want it competing with product pages) but still
   *  `follow`ed so any links pass through. */
  robots: { index: false, follow: true },
};

export default function PoliciesIndexPage() {
  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-8 md:mb-10">
        <h1 className="text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
          Policies
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-muted)] md:text-base">
          The legal documents that govern your use of Zepr — plus the
          page you can use to exercise your privacy rights.
        </p>
      </header>

      <ul className="flex max-w-5xl flex-col divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
        {POLICY_MANIFEST.map((entry) => (
          <li key={entry.handle}>
            <Link
              href={`/policies/${entry.handle}`}
              className="group -mx-3 flex flex-col gap-1 rounded-lg px-3 py-5 transition-colors hover:bg-[color:var(--color-surface-muted)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-base font-semibold text-[color:var(--color-ink)] transition-colors group-hover:text-[color:var(--color-brand)] md:text-lg">
                  {entry.title}
                </span>
                <span className="text-xs text-[color:var(--color-ink-secondary)]">
                  Last updated {formatPolicyDate(entry.lastUpdated)}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                {entry.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
