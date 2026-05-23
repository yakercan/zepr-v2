import { BannerSlider } from "@/components/home/banner-slider";

/**
 * Home route. Each top-level section is its own component — keeps
 * the route file thin and lets each piece evolve independently
 * (banner data → CMS, product feeds → Storefront API, etc.).
 */
export default function HomePage() {
  return (
    <div className="page-container flex flex-col gap-8 py-6">
      <BannerSlider />
    </div>
  );
}
