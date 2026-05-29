import type { Metadata } from "next";
import { BannerSlider } from "@/components/home/banner-slider";
import { MainFeed } from "@/components/home/main-feed";
import { SeoText } from "@/components/seo/seo-text";
import { JsonLd } from "@/lib/seo/json-ld";
import {
  siteNavigationSchema,
  SITE_URL,
  websiteSchema,
} from "@/lib/seo/structured-data";

/**
 * Home route. Each top-level section is its own component — keeps
 * the route file thin and lets each piece evolve independently
 * (banner data → CMS, product feeds → Storefront API, etc.).
 *
 * `searchParams` is awaited (Next 16 makes it a Promise so the
 * framework can defer dynamic reads until they're actually
 * consumed). We forward `tab` + `page` to `MainFeed`; it
 * validates both itself (against the known tab ids / a positive
 * integer respectively).
 */
type HomeSearchParams = { tab?: string; page?: string };

/** Long-form home copy — carried verbatim from the legacy
 *  storefront so the brand's flagship description doesn't drift.
 *  Used for both the `<meta>`/OG description and the hidden,
 *  crawlable intro below. */
const HOME_HEADING = "Zepr | Shop Trends & Explore Deals";
const HOME_DESCRIPTION =
  "Shop smarter with Zepr — discover innovative, trending products that make everyday life easier. Bundle & save with exclusive deals, explore viral favorites, and experience the best way to shop.";

export const metadata: Metadata = {
  /* Absolute title (no `%s | Zepr` template) — the home page is the
   *  brand entry point and reads as its own full title. */
  title: { absolute: HOME_HEADING },
  description: HOME_DESCRIPTION,
  /* Canonical hard-pinned to the bare home URL. The `MainFeed` tabs
   *  (`?tab=best_sellers`, `?tab=flash_sales`, …) are UI-state in the
   *  query string — every variant renders the same page chrome with
   *  one grid swapping data, and the default tab is shuffled per
   *  session, so the bare URL is never byte-stable across crawls.
   *  Without this pin, Google's near-duplicate detector can elect a
   *  `?tab=…` variant as the home canonical and surface (e.g.) "Hot
   *  Deals" for the brand search "Zepr". Pinning to `/` folds every
   *  variant into one ranked URL while crawlers still follow the
   *  product links inside each tab. */
  alternates: { canonical: "/" },
  openGraph: {
    title: HOME_HEADING,
    description: HOME_DESCRIPTION,
    url: `${SITE_URL}/`,
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const { tab, page } = await searchParams;

  return (
    <div className="page-container flex flex-col gap-8 py-6">
      {/* Sitelinks search box + main-nav graph. Organization is
          emitted once in the root layout, so it's not repeated. */}
      <JsonLd data={[websiteSchema(), siteNavigationSchema()]} />
      {/* The visible hero is the banner carousel (no text <h1>), so
          the page's crawlable heading lives here, hidden. */}
      <SeoText heading={HOME_HEADING} description={HOME_DESCRIPTION} />
      <BannerSlider />
      <MainFeed tabParam={tab} pageParam={page} />
    </div>
  );
}
