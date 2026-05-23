/**
 * Static category fallback used by the header dropdown and the
 * categories bar until the live Salespace taxonomy is wired up.
 *
 * Icons live in `/public/category-icons/line/*.svg`; the same handles
 * map cleanly to the `/collections/<handle>` URLs we'll use once
 * the collection routes ship.
 */
export interface NavCategory {
  handle: string;
  title: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: readonly NavCategory[] = [
  {
    handle: "electronics",
    title: "Electronics",
    icon: "/category-icons/line/electronics.svg",
  },
  {
    handle: "clothing",
    title: "Clothing",
    icon: "/category-icons/line/clothing.svg",
  },
  {
    handle: "home-and-living",
    title: "Home & Living",
    icon: "/category-icons/line/home-and-living.svg",
  },
  {
    handle: "beauty-and-health",
    title: "Beauty & Health",
    icon: "/category-icons/line/beauty-and-health.svg",
  },
  {
    handle: "sports-and-outdoors",
    title: "Sports & Outdoors",
    icon: "/category-icons/line/sports-and-outdoors.svg",
  },
  {
    handle: "kids-and-baby",
    title: "Kids & Baby",
    icon: "/category-icons/line/kids-and-baby.svg",
  },
  {
    handle: "pet-essentials",
    title: "Pet Essentials",
    icon: "/category-icons/line/pet-essentials.svg",
  },
  {
    handle: "accessories",
    title: "Accessories",
    icon: "/category-icons/line/accessories.svg",
  },
] as const;
