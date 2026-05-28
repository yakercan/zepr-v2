import type { Metadata } from "next";
import Link from "next/link";

import { FaqList } from "@/components/faq/faq-list";

/**
 * `/faq` — the canonical "frequently asked questions" page.
 *
 * Dedicated server-rendered route (no client-side data fetch)
 * because the content lives in `lib/faq/entries.ts` as a typed
 * TS module — see that file's doc block for the storage
 * rationale. Single-column page-container layout matching
 * `/contact` and `/account/profile/edit` so every "page that is
 * one long form / list" feels the same.
 *
 * Two ambient affordances at the bottom:
 *
 *   - Pointer to `/contact` for shoppers whose question isn't
 *     covered — the FAQ is a starting point, not a wall, and
 *     the form should be one click away on every page they
 *     might land on cold.
 *
 * The list itself emits `FAQPage` JSON-LD inline, so Google
 * indexes the page as a rich result the moment it's deployed.
 */
export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to the most common questions about orders, delivery, and returns at Zepr.",
};

export default function FaqPage() {
  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-8 md:mb-10">
        <h1 className="text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
          Frequently asked questions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-ink-muted)] md:text-base">
          Quick answers to the questions we hear most. Can&rsquo;t find what
          you&rsquo;re looking for? <FooterContactLink />.
        </p>
      </header>

      <FaqList />
    </main>
  );
}

/**
 * Inline "Get in touch" link in the page subtitle. Pulled out
 * so the prose stays readable in the JSX and so the link styles
 * stay in lockstep with the inline-link dialect used inside FAQ
 * answers themselves.
 */
function FooterContactLink() {
  return (
    <Link
      href="/contact"
      className="font-medium text-[color:var(--color-ink)] underline underline-offset-2 transition-colors hover:text-[color:var(--color-brand)]"
    >
      Get in touch
    </Link>
  );
}
