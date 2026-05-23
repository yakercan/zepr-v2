/**
 * Homepage banner slider data.
 *
 * Static for now — same three assets and same destination URLs the
 * original zepr storefront uses, hosted on Salespace's CDN. Kept in
 * a dedicated config file so when an editorial CMS lands later, the
 * slider itself doesn't need to change; we just swap this export
 * with a server fetcher returning the same shape.
 *
 * Banners 2 and 3 link to a curated subcategory mix rather than the
 * full catalogue. The lists are editorial — copied verbatim from
 * the legacy storefront so a click on the same hero lands a
 * shopper on the same product set as before. Stored as a flat
 * `string[]` instead of pre-baked URLs so the config stays
 * readable; the link is built at call time via
 * `buildSearchHref`.
 *
 * `href` is optional — banners without a link still render, they
 * just don't wrap in an `<a>`.
 */

export interface HomeBanner {
  id: string;
  /** 1920×300 image; rendered at the slider's aspect ratio. */
  image: string;
  /** Decorative banners use empty alt; pass meaningful copy
   *  whenever the banner carries unique information not already
   *  duplicated in nearby DOM. */
  alt: string;
  href?: string;
}

/**
 * Build a `/search` href with an optional `sort` and a list of
 * `subcategory` params. Order-preserving; multi-value subcategory
 * is encoded as repeated keys (`?subcategory=A&subcategory=B`),
 * matching what the route handler at `app/search/page.tsx`
 * expects and what the legacy storefront produced.
 */
function buildSearchHref({
  sort,
  subcategories,
}: {
  sort?: string;
  subcategories?: readonly string[];
}): string {
  const params = new URLSearchParams();
  if (sort) params.set("sort", sort);
  for (const sub of subcategories ?? []) params.append("subcategory", sub);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * Banner 2's curated mix — broad lifestyle picks across pets,
 * home, fashion, beauty, and outdoor. Ported verbatim from the
 * original zepr storefront's hero slide.
 */
const FEATURED_SUBCATEGORIES: readonly string[] = [
  "Automotive",
  "Accessories",
  "Bags",
  "Bathroom Accessories",
  "Beds & Furniture",
  "Bowls & Feeders",
  "Bracelets",
  "Camera & Photo",
  "Carriers & Accessories",
  "Carriers & Travel Products",
  "Cleaning Tools",
  "Collars & Harnesses & Leashes",
  "Earrings",
  "Exercise & Fitness",
  "Facial Care",
  "Grooming",
  "Hair Care",
  "Hats & Caps",
  "Home Decor Products",
  "Kitchen & Dining",
  "Kitchen Appliances",
  "Necklaces",
  "Outdoor Lights",
  "Patio & Lawn & Garden",
  "Pet Toys",
  "Rings",
  "Skin Care",
  "Smart Home",
  "Toys & Games",
  "Wellness & Therapy",
];

/**
 * Banner 3's curated mix — same editorial bias, paired with the
 * `best_rated` sort so the highest-scoring products in each
 * subcategory float to the top. Ported verbatim from the original
 * zepr storefront's hero slide.
 */
const BEST_RATED_SUBCATEGORIES: readonly string[] = [
  "Accessories",
  "Bags",
  "Automotive",
  "Bathroom Accessories",
  "Bedding",
  "Camera & Photo",
  "Camping & Hiking",
  "Exercise & Fitness",
  "Facial Care",
  "Fans & Air Conditioners & Heating",
  "Hair Care",
  "Hats & Caps",
  "Earrings",
  "Health Care",
  "Kitchen Appliances",
  "Kitchen & Dining",
  "Patio & Lawn & Garden",
  "Rings",
  "Skin Care",
  "Smart Home",
  "Wellness & Therapy",
  "Women's Dresses",
  "Bracelets",
  "Necklaces",
  "Rugs",
  "Underwear",
  "Socks & Hosiery",
  "Outdoor Lights",
  "Home Decor Products",
  "Hunting & Fishing",
  "Foot & Hand & Nail Care",
];

export const HOME_BANNERS: readonly HomeBanner[] = [
  {
    id: "hot-deals",
    image: "https://cdn.salespace.com/zepr-desktop-banner-1.webp",
    alt: "Shop hot deals",
    href: buildSearchHref({ sort: "hot_deals:desc" }),
  },
  {
    id: "featured",
    image: "https://cdn.salespace.com/zepr-desktop-banner-2.webp",
    alt: "Shop featured categories",
    href: buildSearchHref({ subcategories: FEATURED_SUBCATEGORIES }),
  },
  {
    id: "best-rated",
    image: "https://cdn.salespace.com/zepr-desktop-banner-3.webp",
    alt: "Shop best rated",
    href: buildSearchHref({
      sort: "best_rated:desc",
      subcategories: BEST_RATED_SUBCATEGORIES,
    }),
  },
] as const;
