import { BannerSlider } from "@/components/home/banner-slider";
import { MainFeed } from "@/components/home/main-feed";

/**
 * Home route. Each top-level section is its own component — keeps
 * the route file thin and lets each piece evolve independently
 * (banner data → CMS, product feeds → Storefront API, etc.).
 *
 * `searchParams` is awaited (Next 16 makes it a Promise so the
 * framework can defer dynamic reads until they're actually
 * consumed). We forward only `tab` to `MainFeed`; it parses /
 * validates against the known tab ids itself.
 */
type HomeSearchParams = { tab?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const { tab } = await searchParams;

  return (
    <div className="page-container flex flex-col gap-8 py-6">
      <BannerSlider />
      <MainFeed tabParam={tab} />
    </div>
  );
}
