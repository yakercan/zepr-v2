/**
 * Short-link redirects (`/101` → `/products/<handle>`, etc.).
 *
 * One static map, consumed at build time by `redirects()` in
 * `next.config.ts`. Next.js compiles every entry into a 308
 * "Permanent Redirect" rule that fires at the routing layer
 * before any RSC or middleware runs — same network-cost as a
 * plain redirect header, no JS execution per visit.
 *
 * What these are for: easy-to-type / easy-to-print short URLs
 * we promote on social media, ad creatives, QR codes, etc. A
 * shopper who sees "zepr.com/101" lands directly on the
 * product page. Codes are stable forever — change a handle
 * here and every printed flyer breaks, so prefer "add a new
 * code" over "repurpose an old code".
 *
 * Adding a new short code:
 *
 *   1. Pick the next free integer in the numeric range below
 *      (or a short kebab-case slug for a named one — both
 *      work, they're just keys).
 *   2. Map it to the product / collection / page path.
 *      Examples:
 *        `/products/<handle>`
 *        `/categories/<handle>`
 *        `/pages/<handle>`
 *      Anything routable inside the app is fair game.
 *   3. Ship. Query strings on the short URL are preserved on
 *      the redirect target, so `/101?utm_source=ig` flows
 *      through to the product page intact.
 *
 * Removing / re-pointing a code: only do this knowing every
 * existing flyer / story / share will land somewhere new.
 * Browsers cache 308s aggressively — visitors who hit the
 * code before the change may still bounce to the old target
 * until their cache expires. For marketing-sensitive
 * re-pointings, swap `permanent: true` to `permanent: false`
 * in `next.config.ts` first (turns the entry into a 307 that
 * browsers won't cache), wait a week, then flip it back.
 */
export const SHORTCODE_REDIRECTS: Readonly<Record<string, string>> = {
  "101": "/products/hip-raised-multifunctional-bedside-sleep-cushion",
  "102": "/products/mini-portable-bag-sealer",
  "103": "/products/mini-desktop-vacuum-cleaner",
  "104": "/products/dogs-portable-water-bottle",
  "105": "/products/pet-hair-removal-gloves",
  "107": "/products/domino-train",
  "108": "/products/waterproof-pet-hair-trimmer-with-led-light",
  "109": "/products/self-warming-cat-dog-bed-mat-washable-soft-pet-sleeping-mat",
  "110": "/products/handheld-portable-car-vacuum-cleaner",
  "111": "/products/shoe-washing-machine-bag",
  "112": "/products/volcano-diffuser",
  "113": "/products/laptop-stand-for-bed-portable-lap-desk",
  "114": "/products/hand-grip-strength-trainer-with-counter",
  "115": "/products/frownies-anti-wrinkle-beauty-stickers",
  "116": "/products/cat-slippers",
  "117": "/products/retractable-dog-leash-with-light-bag-dispenser",
  "118": "/products/head-massager-for-migraine-relief",
  "119": "/products/drain-hair-insect-blockers",
  "120": "/products/quick-easy-egg-cracker",
  "121": "/products/inflatable-standing-boxing-trainer",
  "122": "/products/yoga-block-set-2-pack",
  "123": "/products/pelvic-floor-thigh-trainer",
  "124": "/products/adjustable-hand-grip-strength-trainer",
  "125": "/products/coffee-mug-warmer",
  "126": "/products/easy-squeeze-sponge-mop",
  "127": "/products/anti-gravity-levitating-water-drop-humidifier",
  "128": "/products/led-note-board-night-light",
  "129": "/products/3d-crystal-ball-galaxy-night-light",
  "130": "/products/cute-cat-air-humidifier",
  "131": "/products/adjustable-forearm-strength-trainer",
  "132": "/products/women-s-stylish-large-capacity-shoulder-bag",
  "133": "/products/waterproof-dog-raincoat",
  "134": "/products/easy-pour-honey-dispenser",
  "135": "/products/self-mixing-protein-shaker-bottle",
  "136": "/products/interactive-rolling-ball-for-cats",
  "137": "/products/6-in-1-wireless-charging-dock-for-iphone-ipad-apple-watch",
  "138": "/products/pet-nail-clippers-with-led-light",
  "139": "/products/magic-shadow-air-humidifier",
  "140": "/products/fluffy-plush-coat",
  "141": "/products/mosquito-trap-lamp",
  "142": "/products/56-grid-ice-cube-tray-with-press-release",
  "143": "/products/portable-clip-on-cooling-fan",
  "144": "/products/batwing-sleeve-trench-coat",
};

/**
 * Canonical / legacy route redirects — paths the v2 storefront
 * doesn't serve directly but that should still land somewhere
 * sensible. Two flavours live here:
 *
 *   1. **Legacy CMS pages** (`/pages/<handle>`) — the old Shopify
 *      storefront rendered Contact / FAQ / etc. through Sanity-
 *      backed CMS templates. The URLs survive in old email
 *      signatures, printed material, Google's index, third-party
 *      deep links. Each one hops to the corresponding v2 app
 *      route.
 *   2. **Canonical-shorthand routes** — bare paths a shopper or
 *      external linker might reasonably type expecting an index
 *      page that v2 doesn't ship (e.g. `/products` → `/search`,
 *      since browsing in v2 is the search surface, not a
 *      separate products index).
 *
 * Lives alongside `SHORTCODE_REDIRECTS` because both feed the
 * same Next.js `redirects()` table; kept as a separate map
 * because the entry's lifecycle is different — these are
 * forever-redirects we never repurpose, in contrast to marketing
 * shortcodes which occasionally get re-pointed.
 *
 * Keys are the *source* path (must start with `/`), values the
 * canonical destination. Both ends are validated by Next at build
 * time; `permanent: true` (308) is applied in `next.config.ts` so
 * search engines coalesce the old URL into the new one and
 * browsers can cache the hop.
 *
 * **Matching is exact unless the key carries a pattern.** Bare
 * `source: "/products"` matches only `/products`, not
 * `/products/<handle>` — so the PDP route at
 * `app/products/[handle]/page.tsx` keeps working untouched. A
 * `:path*` segment (see `/collections/:path*` below) opts a key
 * into prefix matching and forwards the tail to the destination's
 * matching `:path*`. Only add a pattern when the source prefix
 * maps to *no* v2 app route — otherwise you'll intercept a live
 * page. `/collections/*` is safe because v2 browses under
 * `/categories`, never `/collections`.
 *
 * Adding a redirect: only do this when there's a known existing
 * link or expected typing pattern pointing at a URL the v2
 * storefront doesn't serve. Every entry adds one rule the routing
 * layer evaluates per request — cheap individually, but the table
 * shouldn't be a junk drawer.
 */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  /* Old Shopify-storefront content pages (`/pages/<handle>` is
   * the legacy CMS-page convention). Both `contact` and `faq`
   * used to render through Sanity-backed CMS templates; in v2
   * they live as dedicated app routes. The legacy URLs survive
   * in old email signatures / printed material / Google's index
   * — these redirects keep every old link a one-hop trip to the
   * new home. */
  "/pages/contact": "/contact",
  "/pages/faq": "/faq",
  /* Canonical-shorthand: v2 doesn't have a standalone "products
   * index" page — browsing happens through `/search` (Salespace
   * powers both the bare landing state and queried results). A
   * shopper who types `/products` in the address bar, or follows
   * an old link expecting that URL, lands on the surface that
   * actually does what they want. Bare path on both sides on
   * purpose — `/products/<handle>` continues to render the PDP
   * because Next's redirect matcher only fires on exact source
   * equality without a `:slug` pattern. */
  "/products": "/search",
  /* Legacy Shopify collection paths. The old storefront browsed
   * under `/collections/<handle>`; v2 serves the same surface at
   * `/categories/<handle>`. The `:path*` wildcard forwards the whole
   * tail (handle + any nested segments) verbatim, and bare
   * `/collections` maps to `/categories` too. Query strings carry
   * through automatically, so old filter/sort params survive the
   * hop. Safe to pattern-match: v2 has no `/collections` route. */
  "/collections/:path*": "/categories/:path*",
};
