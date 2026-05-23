import { cn } from "@/lib/utils";

/**
 * Render trusted, admin-authored HTML with the storefront's prose
 * styling.
 *
 * Used by the PDP description, the future reviews / disclaimer
 * accordion sections, and any other rich-text surface (legal,
 * FAQ, etc.). Centralising the prose classes means every
 * surface speaks the same typographic language and a polish
 * pass touches one file instead of N.
 *
 * Trusted input only — Shopify admin and our own CMS. The
 * storefront never accepts user-authored HTML, so
 * `dangerouslySetInnerHTML` is safe here. If we ever surface
 * shopper-authored markup (e.g. review bodies), it needs to be
 * sanitised *before* it reaches this component.
 *
 * No `@tailwindcss/typography` dep — the supported tag set is
 * small (`p`, `ul`, `ol`, `li`, `h2`, `h3`, `strong`, `a`) and
 * targeting them directly with Tailwind's child-selector syntax
 * keeps the bundle clean and the design tokens consistent.
 */
const PROSE_CLASSES =
  "text-sm leading-relaxed text-[color:var(--color-ink-secondary)] " +
  "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-1 " +
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-[color:var(--color-ink)] " +
  "[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[color:var(--color-ink)] " +
  "[&_strong]:font-semibold [&_strong]:text-[color:var(--color-ink)] " +
  "[&_a]:text-[color:var(--color-brand)] [&_a]:underline-offset-2 hover:[&_a]:underline";

export interface RichTextProps {
  html: string;
  className?: string;
}

export function RichText({ html, className }: RichTextProps) {
  if (!html) return null;
  return (
    <div
      className={cn(PROSE_CLASSES, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
