/**
 * Static manifest of links the site footer renders.
 *
 * Lives in a typed module rather than inside the component so:
 *
 *   - Marketing edits (rename "Shop all" → "Browse all", swap a
 *     category for a campaign collection, etc.) are content
 *     changes, not component changes.
 *   - The same link sets can be re-used elsewhere later (e.g. a
 *     mobile slide-out, a 404 page, an email template) without
 *     copy-pasting.
 *   - Types make sure every entry has the shape the footer
 *     component expects.
 *
 * Policy links live in `src/lib/policies/manifest.ts` and are
 * imported there by the footer — single source of truth for
 * legal-doc titles and URLs.
 */

export interface FooterLink {
  /** App-relative path or absolute URL. App-relative paths render
   *  via `next/link`; absolute URLs render as plain `<a>` so we
   *  don't try to client-side-route into another origin. */
  href: string;
  /** User-facing label. Title Case across the footer so it reads
   *  as one consistent navigation surface (Shop / Categories /
   *  Help columns plus the brand row). */
  label: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: ReadonlyArray<FooterLink>;
}

/**
 * "Shop" column — the discovery surfaces a shopper navigates to
 * when they don't have a specific category in mind. All point
 * into `/search`, which is v2's universal product browsing
 * surface; the query string selects the sort dialect and the
 * sort values mirror `SORT_OPTIONS` in `search-filters.tsx`, so
 * landing on `/search?sort=…` from the footer pre-selects the
 * matching dropdown entry.
 *
 * Ordering mirrors the homepage feed tabs (Best Sellers → Hot
 * Deals → Top Rated → Newest) so shoppers see the same hierarchy
 * whether they're discovering from the hero or the footer.
 */
export const SHOP_LINKS: ReadonlyArray<FooterLink> = [
  { href: "/search", label: "Best Sellers" },
  { href: "/search?sort=hot_deals%3Adesc", label: "Hot Deals" },
  { href: "/search?sort=best_rated%3Adesc", label: "Top Rated" },
  { href: "/search?sort=newest%3Adesc", label: "New Arrivals" },
];

/**
 * "Help" column — destinations a shopper reaches for when
 * something needs explaining. Trimmed to the four highest-value
 * actions: My Account (auth + dashboard), Orders & Returns
 * (which routes through `/account/orders` since the v2 returns
 * flow is initiated from the order detail page), Contact Us
 * (escalation), and FAQs (self-serve). Anything beyond that —
 * shipping policy, payment methods, etc. — belongs on a help
 * article page surfaced through the FAQ, not in the chrome.
 */
export const HELP_LINKS: ReadonlyArray<FooterLink> = [
  { href: "/account", label: "My Account" },
  { href: "/account/orders", label: "Orders & Returns" },
  { href: "/contact", label: "Contact Us" },
  { href: "/faq", label: "FAQs" },
];

/**
 * "Categories" column — top-level taxonomy entries. Labels match
 * `DEFAULT_CATEGORIES` in `src/config/categories.ts` (Title Case,
 * canonical spellings) so the footer and the header dropdown use
 * the exact same wording.
 */
export const CATEGORY_LINKS: ReadonlyArray<FooterLink> = [
  { href: "/categories/clothing", label: "Clothing" },
  { href: "/categories/beauty-and-health", label: "Beauty & Health" },
  { href: "/categories/electronics", label: "Electronics" },
  { href: "/categories/home-and-living", label: "Home & Living" },
  { href: "/categories/kids-and-baby", label: "Kids & Baby" },
  { href: "/categories/pet-essentials", label: "Pet Essentials" },
  { href: "/categories/sports-and-outdoors", label: "Sports & Outdoors" },
  { href: "/categories/accessories", label: "Accessories" },
];

/**
 * Social profile destinations. Names mirror the legacy storefront
 * footer so we don't break the established external presence;
 * URLs point at Zepr's owned handles on each network.
 *
 * `id` is a stable key the icon resolver matches against, so
 * adding a new network is a manifest edit plus an icon import,
 * not a component refactor.
 */
export type FooterSocialId = "instagram" | "facebook" | "tiktok";

export interface FooterSocial {
  id: FooterSocialId;
  label: string;
  href: string;
}

export const FOOTER_SOCIALS: ReadonlyArray<FooterSocial> = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/shopzepr",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/shopzepr",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@zepr.com",
  },
];

/**
 * Contact endpoint shown in the brand block. Single entry,
 * server-side string — phone support and physical address
 * deliberately live on the policy pages only (legal compliance
 * surface), not as footer decoration.
 */
export const FOOTER_CONTACT_EMAIL = "hello@zepr.com";

/**
 * Year the brand started, used in the copyright stamp. Updating
 * this is the only thing required when the calendar flips —
 * `new Date().getFullYear()` does the dynamic half automatically.
 */
export const FOOTER_COPYRIGHT_YEAR_START = 2025;
