import type { ReactNode } from "react";

import { PolicyCrossNav } from "@/components/policy/policy-cross-nav";
import {
  type PolicyHandle,
  findPolicy,
  formatPolicyDate,
} from "@/lib/policies/manifest";

/**
 * Shared page shell for the legal docs under `/policies/*`.
 *
 * Renders the page header (title + "Last updated" stamp), the
 * caller-supplied body content (wrapped in the prose typography
 * wrapper at the call site so the shell stays content-agnostic),
 * and a cross-policy footer nav so a reader who lands on one
 * policy can jump straight to the others without going back
 * through the index.
 *
 * The shell deliberately does *not* wrap the body in `<Prose>`
 * — that's the policy component's call so the shell can also
 * host non-prose layouts later (e.g. the `/policies` index)
 * without forcing them through legal-doc typography.
 */
export interface PolicyPageProps {
  handle: PolicyHandle;
  children: ReactNode;
}

export function PolicyPage({ handle, children }: PolicyPageProps) {
  const entry = findPolicy(handle);
  if (!entry) {
    /* Should be impossible — every route binds to a real
     * `PolicyHandle` literal, validated at compile time. If we
     * somehow get here at runtime, surface a useful message
     * rather than crashing on `entry.title`. */
    return null;
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-8 md:mb-10">
        <h1 className="text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
          {entry.title}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-muted)]">
          Last updated {formatPolicyDate(entry.lastUpdated)}
        </p>
      </header>

      {children}

      <PolicyCrossNav currentHandle={handle} />
    </main>
  );
}
