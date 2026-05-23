import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Static category fallback for the header dropdown and the categories
 * bar. Used when the Salespace taxonomy API is unavailable (missing
 * key, network error, cold revalidation race) so the header still
 * renders something meaningful instead of an empty panel.
 *
 * Shape matches `TaxonomyCategory` exactly so the rendering code
 * doesn't need to branch on data source. Subcategories are an empty
 * array here — when the API responds, those populate from the wire.
 */
export const DEFAULT_CATEGORIES: readonly TaxonomyCategory[] = [
  {
    id: 1,
    handle: "electronics",
    name: "Electronics",
    iconUrl: "/category-icons/line/electronics.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 2,
    handle: "clothing",
    name: "Clothing",
    iconUrl: "/category-icons/line/clothing.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 3,
    handle: "home-and-living",
    name: "Home & Living",
    iconUrl: "/category-icons/line/home-and-living.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 4,
    handle: "beauty-and-health",
    name: "Beauty & Health",
    iconUrl: "/category-icons/line/beauty-and-health.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 5,
    handle: "sports-and-outdoors",
    name: "Sports & Outdoors",
    iconUrl: "/category-icons/line/sports-and-outdoors.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 6,
    handle: "kids-and-baby",
    name: "Kids & Baby",
    iconUrl: "/category-icons/line/kids-and-baby.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 7,
    handle: "pet-essentials",
    name: "Pet Essentials",
    iconUrl: "/category-icons/line/pet-essentials.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
  {
    id: 8,
    handle: "accessories",
    name: "Accessories",
    iconUrl: "/category-icons/line/accessories.svg",
    imageUrl: null,
    shopifyCollectionId: null,
    productCount: 0,
    subcategories: [],
  },
] as const;
