import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { formatMarketAmount } from "@/config/markets";
import { freeShippingThresholdCents } from "@/lib/badges";
import { resolveFaqSections, type FaqSection } from "@/lib/faq/entries";
import { getServerMarket } from "@/lib/market/server";

/**
 * FAQ page body.
 *
 * Renders each `FaqSection` as a titled bucket of expandable
 * rows on the same `<Accordion>` primitive the PDP uses for
 * "Details / Reviews / Disclaimer" — one visual dialect for
 * every "scannable index of expandable rows" surface in the
 * storefront.
 *
 * The component is a plain server component because the only
 * interactive bit (the disclosure animation) is owned by
 * `<AccordionItem>` itself — the FAQ layer is pure rendering.
 *
 * Answer parsing is intentionally tiny:
 *
 *   - `\n` (single newline)             → paragraph break.
 *   - `[label](href)` markdown links    → `<Link>` for internal
 *                                         hrefs (`/…`), plain
 *                                         `<a>` for mailto + http.
 *
 * No bold / italic / lists / images. The support copy doesn't
 * need them and adding a markdown library for the four FAQ
 * entries that contain any markup at all would be a poor trade.
 *
 * SEO: emits `FAQPage` JSON-LD so Google can surface the page
 * as a rich result. Schema text strips the link markdown to
 * plain text (search consumers don't need our routing) but
 * keeps the prose intact.
 */
export async function FaqList() {
  /* Resolve the visitor's market so the shipping-cost answer reads
   * the right threshold + currency (US/UK $50/£50, SG S$60, CA/NZ/AU
   * $70). Same geo resolution the currency / cookie-banner logic uses.
   * Whole-unit format (no ".00") keeps the prose clean. */
  const market = await getServerMarket();
  const shippingThreshold = formatMarketAmount(
    freeShippingThresholdCents(market.currency),
    market.currency,
    0,
  );
  const sections = resolveFaqSections(shippingThreshold);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <FaqJsonLd sections={sections} />
      {sections.map((section) => (
        <FaqSectionBlock key={section.id} section={section} />
      ))}
    </div>
  );
}

function FaqSectionBlock({ section }: { section: FaqSection }) {
  return (
    <section id={section.id}>
      {/* Section title doubles as the deep-link anchor — `id` on
       *  the `<section>` gives `/faq#delivery` etc. for free. */}
      <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-ink)] md:text-xl">
        {section.title}
      </h2>
      <Accordion>
        {section.items.map((item) => (
          <AccordionItem key={item.id} title={item.question}>
            <FaqAnswer text={item.answer} />
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Answer rendering                                                    */
/* ------------------------------------------------------------------ */

/**
 * Render a markdown-lite answer string. Splits on newlines for
 * paragraph breaks, then runs each paragraph through the link
 * parser so `[label](href)` snippets become real anchors.
 *
 * Kept inline rather than lifted to `lib/` because:
 *
 *   - The dialect is purely an `<FaqList>` rendering concern;
 *     no other surface needs to parse this exact subset.
 *   - The whole thing is ~25 lines — sub-library threshold.
 */
function FaqAnswer({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  return (
    <div className="flex flex-col gap-3 text-[color:var(--color-ink-muted)]">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed md:text-base">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/* Inline link class: ink body text, brand-orange on hover, with
 * a permanent underline so the link reads as one even before the
 * pointer crosses it. Matches the inline-prose link dialect we'd
 * pick anywhere the storefront has links inside body copy. */
const INLINE_LINK_CLASSES =
  "font-medium text-[color:var(--color-ink)] underline underline-offset-2 transition-colors hover:text-[color:var(--color-brand)]";

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  /* `LINK_RE` is module-scoped, so reset its lastIndex on every
   * call — otherwise consecutive renders share the regex's state
   * and skip half their matches. */
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(
        <Fragment key={`t-${cursor}`}>{text.slice(cursor, match.index)}</Fragment>,
      );
    }
    const [, label, href] = match;
    parts.push(
      <FaqInlineLink key={`l-${match.index}`} href={href}>
        {label}
      </FaqInlineLink>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(<Fragment key={`t-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }
  return parts;
}

function FaqInlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  /* Internal app routes (`/…`) get `<Link>` for client-side
   * navigation. Mailto + http(s) fall back to plain `<a>`. The
   * `noopener` rel on external http(s) prevents the new tab from
   * accessing our `window.opener` reference — standard hygiene
   * for outbound links. */
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={INLINE_LINK_CLASSES}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      className={INLINE_LINK_CLASSES}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* JSON-LD schema                                                      */
/* ------------------------------------------------------------------ */

/**
 * Emits a `FAQPage` schema.org payload so Google can surface
 * the FAQ as a rich result. Renders inside a `<script>` tag,
 * which Next streams server-side; the browser sees a static
 * `application/ld+json` blob with no runtime cost.
 *
 * Strips markdown link syntax from answers so search consumers
 * see clean prose ("our Order Tracking page") rather than the
 * raw `[label](href)` source. Drops the destination on purpose —
 * Schema.org's `Answer.text` is plain text; rich answers belong
 * in a separate `mainEntityOfPage` graph we don't yet need.
 */
function FaqJsonLd({
  sections,
}: {
  sections: ReadonlyArray<FaqSection>;
}) {
  const allItems = sections.flatMap((section) => section.items);
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: stripLinks(item.answer),
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function stripLinks(text: string): string {
  /* `[label](href)` → `label`. Same regex shape as the inline
   * renderer; here the destination is intentionally discarded. */
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}
