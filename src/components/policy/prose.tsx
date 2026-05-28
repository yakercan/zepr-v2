import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Typography wrapper for long-form legal prose (privacy policy,
 * cookie policy, terms & conditions). One place to set the
 * h2/h3/p/ul/li/strong/a dialect used inside legal docs so
 * every policy page reads the same — and so updating the type
 * scale later is a single edit instead of touching every doc.
 *
 * Implemented via Tailwind 4's arbitrary-variant selectors
 * (`[&_h2]:…`) so the children write plain semantic HTML
 * (`<h2>…`) and inherit the style without per-element classes.
 * Same idea as `@tailwindcss/typography`'s `prose` class but
 * scoped to exactly the elements legal docs use, tinted to our
 * ink + brand palette, and free of the typography plugin's
 * heavy reset.
 *
 * Width: capped at `max-w-5xl` (1024px ≈ 120 characters at the
 * 16px body size). Wide enough to use a meaningful slice of the
 * 1400px page-container without leaving an awkward empty right
 * gutter; capped because past ~130 characters per line the
 * reader's eye loses the line-start anchor and scanning legal
 * prose gets noticeably harder. Bumping above `5xl` (or removing
 * the cap entirely) is a readability regression, not a layout
 * upgrade.
 *
 * `id="…"` on a heading enables deep-link anchors —
 * `/policies/privacy-policy#your-rights` scrolls straight to
 * that section thanks to the browser's default anchor handler.
 * Set ids on h2s when the section title is something a user
 * might link to externally.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-5xl",
        /* Headings — sit on the ink palette, generous top margin
         * so each section reads as its own block without needing
         * a horizontal rule. `first-child:mt-0` keeps the first
         * heading flush with the wrapper's top edge. */
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[color:var(--color-ink)] md:[&_h2]:text-2xl",
        "[&_h2:first-child]:mt-0",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[color:var(--color-ink)] md:[&_h3]:text-lg",
        /* Body paragraphs — muted-ink secondary text, comfortable
         * line height for long-form reading. */
        "[&_p]:my-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-[color:var(--color-ink-muted)] md:[&_p]:text-base",
        /* Unordered lists — small left padding so the bullet
         * markers don't crash into the heading rail. `marker:`
         * tints the bullet to a softer ink-secondary so the
         * dot doesn't outweigh the text. */
        "[&_ul]:my-4 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5",
        "[&_li]:list-disc [&_li]:pl-1 [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-[color:var(--color-ink-muted)] [&_li]:marker:text-[color:var(--color-ink-secondary)] md:[&_li]:text-base",
        /* Inline emphasis. Bolded copy snaps back to ink so the
         * scannable terms (`Right to delete`, `Data controller`,
         * etc.) carry visual weight against the muted body. */
        "[&_strong]:font-semibold [&_strong]:text-[color:var(--color-ink)]",
        /* Inline links — same dialect as the FAQ's inline links
         * for consistency. Ink body, brand-orange hover, permanent
         * underline so links read as links inside paragraph copy. */
        "[&_a]:font-medium [&_a]:text-[color:var(--color-ink)] [&_a]:underline [&_a]:underline-offset-2 [&_a]:transition-colors [&_a:hover]:text-[color:var(--color-brand)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
