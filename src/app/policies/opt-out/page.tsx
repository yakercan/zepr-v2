import type { Metadata } from "next";

import { PolicyCrossNav } from "@/components/policy/policy-cross-nav";
import { PrivacyRequestForm } from "@/components/privacy/privacy-request-form";

/**
 * `/policies/opt-out` — U.S. state-law privacy preferences page.
 *
 * One destination for every privacy right Zepr is obligated to
 * honour under U.S. state law: opt-out of sale/sharing,
 * marketing unsubscribe, correction, access, and deletion.
 * Captures intent + an email to reply to; support handles
 * identity verification and the actual processing out-of-band.
 *
 * Why one page for every state instead of California-only: the
 * CCPA / CPRA, Colorado CPA, Virginia VCDPA, Texas TDPSA,
 * Florida FDBR (and more) all expose the same family of
 * consumer rights with slightly different timelines. One intake
 * form covering all of them is easier for shoppers (no "which
 * state am I in?" cognitive load), simpler for support (one
 * inbox, one workflow), and trivially future-proof when the
 * next state law lands.
 *
 * Layout — single column, form fills the page-container width.
 * Same shape as `/contact` so every "page that is one form"
 * feels the same.
 *
 * SEO — `noindex, nofollow`. Legal-mechanism pages don't
 * compete for organic traffic and showing up in search results
 * for "privacy request zepr" would be more noise than signal.
 * The page is reachable from the footer / explicit deep links;
 * it doesn't need crawl exposure.
 */
export const metadata: Metadata = {
  title: "Privacy request",
  description:
    "Submit a request to opt out, unsubscribe, correct, access, or delete your personal information under applicable U.S. state privacy laws.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivacyRequestPage() {
  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-8 md:mb-10">
        <h1 className="text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
          Your privacy choices
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-muted)] md:text-base">
          Manage how we use your personal information. You can request to opt
          out of sale or sharing, unsubscribe from marketing, or ask us to
          correct, access, or delete your information. We honour these
          requests under applicable U.S. state privacy laws — including
          California, Colorado, Virginia, Texas, Florida, and others.
        </p>
      </header>

      <PrivacyRequestForm />

      <PolicyCrossNav currentHandle="opt-out" />
    </main>
  );
}
