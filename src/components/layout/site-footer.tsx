import Image from "next/image";
import Link from "next/link";

import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
} from "@/components/ui/icons";
import { site } from "@/config/site";
import {
  CATEGORY_LINKS,
  FOOTER_CONTACT_EMAIL,
  FOOTER_COPYRIGHT_YEAR_START,
  FOOTER_SOCIALS,
  HELP_LINKS,
  SHOP_LINKS,
  type FooterColumn,
  type FooterLink,
  type FooterSocialId,
} from "@/lib/footer/links";
import { POLICY_MANIFEST } from "@/lib/policies/manifest";

/**
 * Site-wide footer. Server component — every link target and
 * label is static so there's nothing to hydrate. Lives outside
 * `<main>` so screen readers and the route's outline stay clean.
 *
 * Layout — two horizontal bands separated by a hairline divider:
 *
 *   1. **Primary band.** Brand identity on the left (logo,
 *      tagline, contact email, social icons) and three link
 *      columns on the right (shop → help → discover). Uses a
 *      single CSS grid that collapses to a stack on mobile and
 *      reflows to 6 columns on desktop so each column owns its
 *      own width without doing per-column responsive guesses.
 *
 *   2. **Bottom strip.** Copyright stamp on the left, policy
 *      links on the right. Mirrors the legacy storefront's
 *      bottom-bar pattern — it's where shoppers expect to find
 *      privacy / terms / preferences, and pinning them there
 *      keeps the primary nav columns focused on commerce.
 *
 * Visual tone — top border + plain white background, no
 * coloured cards, no decorative wash. Same dialect as the
 * header's `border-b` rule so the chrome reads as one bracket
 * around the page content rather than two separate components.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--color-border)] bg-white">
      <PrimaryBand />
      <BottomStrip />
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Primary band: brand block + nav columns                             */
/* ------------------------------------------------------------------ */

function PrimaryBand() {
  /* Six columns at `lg`, left-to-right:
   *
   *   Brand (2) → Shop (1) → Help (1) → Discover (2)
   *
   * Discover (the taxonomy column) spans two because its labels
   * are longer ("Beauty & Health", "Sports & Outdoors") and it
   * runs an inner 2-column grid for the 8 entries — needs room
   * for both sub-columns to fit a full label without wrapping.
   * Pinning Discover to the right edge gives the widest column
   * the most slack against the page gutter; the two single-col
   * nav lists (Shop, Help) sit between the brand block and the
   * taxonomy grid in narrative order — first what to buy, then
   * where to go for help, then the full browse surface.
   *
   * At `sm` the brand block sits above the nav grid (two-by-two
   * below it). At base, everything stacks vertically — long-but-
   * readable rather than cramped. */
  return (
    <div className="page-container py-12 md:py-16">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:gap-8 lg:grid-cols-6 lg:gap-12">
        <BrandBlock />
        <FooterLinkColumn
          column={{
            id: "shop",
            title: "Shop",
            links: SHOP_LINKS,
          }}
        />
        <FooterLinkColumn
          column={{
            id: "help",
            title: "Help",
            links: HELP_LINKS,
          }}
        />
        <DiscoverColumn />
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex flex-col gap-5 sm:col-span-2 lg:col-span-2">
      <Link href="/" aria-label={site.name} className="inline-flex">
        {/* Square logo (same asset the header uses) sized to 48×48
         *  — a touch larger than the header's 40×40 so the brand
         *  has a little more presence below the fold without
         *  going gratuitous. `priority` is *not* set: the footer
         *  is below the fold on every route, so the LCP doesn't
         *  depend on it. */}
        <Image
          src="/zepr-logo.svg"
          alt={site.name}
          width={48}
          height={48}
          className="h-12 w-12"
        />
      </Link>

      <p className="max-w-sm text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
        {site.tagline}
      </p>

      <a
        href={`mailto:${FOOTER_CONTACT_EMAIL}`}
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-brand)]"
      >
        {FOOTER_CONTACT_EMAIL}
      </a>

      <SocialRow />
    </div>
  );
}

function SocialRow() {
  return (
    <ul className="flex items-center gap-2">
      {FOOTER_SOCIALS.map((social) => (
        <li key={social.id}>
          <a
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.label}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-ink)]"
          >
            <SocialGlyph id={social.id} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function SocialGlyph({ id }: { id: FooterSocialId }) {
  /* Switch on the manifest id rather than passing the icon
   * component itself through the data layer — keeps `links.ts`
   * pure data (no JSX imports there) and makes the icon set easy
   * to swap out for, say, a brand refresh later. */
  switch (id) {
    case "instagram":
      return <InstagramIcon className="h-5 w-5" />;
    case "facebook":
      return <FacebookIcon className="h-5 w-5" />;
    case "tiktok":
      return <TikTokIcon className="h-5 w-5" />;
  }
}

/* ------------------------------------------------------------------ */
/* Nav link columns                                                    */
/* ------------------------------------------------------------------ */

function FooterLinkColumn({ column }: { column: FooterColumn }) {
  return (
    <nav aria-labelledby={`footer-${column.id}-title`}>
      <ColumnTitle id={`footer-${column.id}-title`}>{column.title}</ColumnTitle>
      <ul className="mt-4 flex flex-col gap-2">
        {column.links.map((link) => (
          <li key={`${column.id}-${link.label}`}>
            <FooterNavLink link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Discover column — surfaces the top-level taxonomy entries as
 * a browse rail. Special-cased because it carries eight items
 * (twice as many as Shop / Help) and needs an inner 2-column
 * grid on `lg` so the footer's overall height doesn't balloon.
 * On smaller breakpoints it falls back to a single column same
 * as the other nav lists.
 *
 * Titled "Discover" rather than "Categories" — the link set is
 * a `CATEGORY_LINKS` import for taxonomy-correctness, but the
 * shopper-facing header frames the column as a "where to start
 * browsing" surface, which reads better than the internal
 * taxonomy label.
 */
function DiscoverColumn() {
  return (
    <nav
      aria-labelledby="footer-discover-title"
      className="lg:col-span-2"
    >
      <ColumnTitle id="footer-discover-title">Discover</ColumnTitle>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-2">
        {CATEGORY_LINKS.map((link) => (
          <li key={`discover-${link.label}`}>
            <FooterNavLink link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ColumnTitle({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-secondary)]"
    >
      {children}
    </h3>
  );
}

function FooterNavLink({ link }: { link: FooterLink }) {
  return (
    <Link
      href={link.href}
      className="text-sm font-medium text-[color:var(--color-ink-muted)] transition-colors hover:text-[color:var(--color-brand)]"
    >
      {link.label}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom strip: copyright + policy links                              */
/* ------------------------------------------------------------------ */

function BottomStrip() {
  const year = new Date().getFullYear();

  return (
    <div className="border-t border-[color:var(--color-border)]">
      <div className="page-container flex flex-col-reverse items-center gap-4 py-6 text-xs text-[color:var(--color-ink-muted)] md:flex-row md:justify-between">
        <p className="text-center md:text-left">
          &copy; {FOOTER_COPYRIGHT_YEAR_START}&ndash;{year} Zepr by Salespace
          Platforms, Inc. All rights reserved.
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:justify-end">
          {POLICY_MANIFEST.map((policy) => (
            <li key={policy.handle}>
              <Link
                href={`/policies/${policy.handle}`}
                className="font-medium text-[color:var(--color-ink-muted)] transition-colors hover:text-[color:var(--color-ink)]"
              >
                {policy.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
