/**
 * Homepage banner slider data.
 *
 * Static for now — same three assets the original zepr storefront
 * uses, hosted on Salespace's CDN. Kept in a dedicated config file
 * so when an editorial CMS lands later, the slider itself doesn't
 * need to change; we just swap this export with a server fetcher
 * returning the same shape.
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

export const HOME_BANNERS: readonly HomeBanner[] = [
  {
    id: "hot-deals",
    image: "https://cdn.salespace.com/zepr-desktop-banner-1.webp",
    alt: "Shop hot deals",
    href: "/search?sort=hot_deals%3Adesc",
  },
  {
    id: "shop-all",
    image: "https://cdn.salespace.com/zepr-desktop-banner-2.webp",
    alt: "Shop the full catalog",
    href: "/search",
  },
  {
    id: "best-rated",
    image: "https://cdn.salespace.com/zepr-desktop-banner-3.webp",
    alt: "Shop best rated",
    href: "/search?sort=best_rated%3Adesc",
  },
] as const;
