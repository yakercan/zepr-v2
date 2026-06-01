import "server-only";

import { getServerCountry } from "@/lib/market/server";
import { shopifyFetch } from "@/lib/shopify/client";
import type { CartLine } from "@/types/cart";

/**
 * Shopify Storefront Cart API bindings.
 *
 * Owns every cart-mutation round-trip the storefront makes:
 * `cartCreate`, `cartLinesAdd`, `cartLinesUpdate`, `cartLinesRemove`,
 * `cartBuyerIdentityUpdate`, plus the `getOrCreateCart` helper every
 * action funnels through. Returns the canonical `Cart` shape (or
 * `null` on hard failure) and a `cartToCartLines` projector that
 * maps Shopify's DTO onto the local `CartLine` the drawer already
 * renders.
 *
 * Server-only. The Storefront token never crosses the network
 * boundary; everything here runs inside Server Actions / Route
 * Handlers via `shopifyFetch`.
 *
 * Cart lifetime: Shopify carts live ~10 days from the last update.
 * `getOrCreateCart` covers the expired / deleted / "checked out and
 * gone" path by falling back to `cartCreate`. Callers never have to
 * branch on "does this id still exist?" — they always get a usable
 * cart back (or `null` only on infrastructure failure).
 *
 * Buyer identity policy: when the caller passes a
 * `customerAccessToken` (the Customer Account API access token from
 * `session.tokens.accessToken`), it's attached on every write. That
 * makes the cart "the customer's cart" on Shopify's side — checkout
 * pre-fills the customer profile, address book, and saved payment
 * methods. Guest mode passes `undefined` and the cart stays
 * anonymous on Shopify.
 *
 * Multi-market pricing: the cart's currency is governed entirely by
 * `buyerIdentity.countryCode`. We stamp it from the visitor's
 * resolved market (`getServerCountry()`) at creation, so a cart is
 * priced in the local currency from line one — and because *both*
 * the displayed `cost` and what Shopify checkout charges derive from
 * that single stored field, display and charge can never diverge
 * (the "show £X, charge $Y" trap). If a returning shopper's market
 * has drifted from the cart's stored country (relocation, VPN),
 * `getOrCreateCart` repriceses the cart via `cartBuyerIdentityUpdate`
 * on the next mutation, keeping the two aligned. Country is resolved
 * inside this module, so the action layer needs no country plumbing.
 */

/* ------------------------------------------------------------------ */
/* GraphQL                                                              */
/* ------------------------------------------------------------------ */

/* Shared cart projection — every mutation returns this same shape so
 * the call-site mapping (`cartToCartLines` + a few scalar reads) is
 * one function. `lines(first: 250)` matches Shopify's per-cart cap;
 * the API rejects carts over that limit, so paginating server-side
 * would be a wasted round-trip. */
const CART_FRAGMENT = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    totalQuantity
    checkoutUrl
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
    }
    buyerIdentity {
      email
      countryCode
    }
    lines(first: 250) {
      nodes {
        id
        quantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
          compareAtAmountPerQuantity {
            amount
            currencyCode
          }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            product {
              id
              handle
              title
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;

const CART_QUERY = /* GraphQL */ `
  query Cart($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
  ${CART_FRAGMENT}
`;

const CART_CREATE_MUTATION = /* GraphQL */ `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

const CART_LINES_ADD_MUTATION = /* GraphQL */ `
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

const CART_LINES_UPDATE_MUTATION = /* GraphQL */ `
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

const CART_LINES_REMOVE_MUTATION = /* GraphQL */ `
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

const CART_BUYER_IDENTITY_UPDATE_MUTATION = /* GraphQL */ `
  mutation CartBuyerIdentityUpdate(
    $cartId: ID!
    $buyerIdentity: CartBuyerIdentityInput!
  ) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

const CART_ATTRIBUTES_UPDATE_MUTATION = /* GraphQL */ `
  mutation CartAttributesUpdate(
    $cartId: ID!
    $attributes: [AttributeInput!]!
  ) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
  ${CART_FRAGMENT}
`;

/* ------------------------------------------------------------------ */
/* Wire shapes                                                          */
/* ------------------------------------------------------------------ */

interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

interface RawCartImage {
  url: string;
  altText: string | null;
}

interface RawCartMerchandise {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  image: RawCartImage | null;
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
  product: {
    id: string;
    handle: string;
    title: string;
    featuredImage: RawCartImage | null;
  };
}

interface RawCartLine {
  id: string;
  quantity: number;
  cost: {
    totalAmount: MoneyV2;
    compareAtAmountPerQuantity: MoneyV2 | null;
  };
  merchandise: RawCartMerchandise;
}

interface RawUserError {
  field: string[] | null;
  message: string;
  code: string | null;
}

export interface RawCart {
  id: string;
  totalQuantity: number;
  checkoutUrl: string;
  cost: {
    subtotalAmount: MoneyV2;
  };
  buyerIdentity: {
    email: string | null;
    /** ISO 3166-1 alpha-2 of the cart's pricing market. Drives both
     *  the returned `cost` currency and what checkout charges. */
    countryCode: string | null;
  };
  lines: {
    nodes: RawCartLine[];
  };
}

/* ------------------------------------------------------------------ */
/* Public surface                                                       */
/* ------------------------------------------------------------------ */

/** Lightweight read — the drawer needs lines + scalars; checkout
 *  needs the URL. We surface only what callers render. */
export interface Cart {
  id: string;
  totalQuantity: number;
  checkoutUrl: string;
  subtotalCents: number;
  currency: string;
  /** The cart's pricing market (ISO alpha-2), read from
   *  `buyerIdentity.countryCode`. `getOrCreateCart` compares this
   *  against the visitor's current market to decide whether to
   *  reprice. `null` only for legacy carts created before the
   *  field was stamped. */
  countryCode: string | null;
  lines: ReadonlyArray<CartLine>;
}

/** One input line for `cartLinesAdd`. `merchandiseId` is the
 *  variant GID; `attributes` is the open-ended free-text bag
 *  Shopify exposes per line — kept here for future UTM / source
 *  tagging without forcing every callsite to pass it now. */
export interface CartLineInput {
  merchandiseId: string;
  quantity: number;
  attributes?: ReadonlyArray<{ key: string; value: string }>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function toCents(money: MoneyV2 | null | undefined): number {
  if (!money?.amount) return 0;
  return Math.round(parseFloat(money.amount) * 100);
}

/**
 * Project a Shopify cart's `lines` array onto our local
 * `CartLine[]`. One-to-one — Shopify returns one entry per cart
 * row, our drawer renders one row per entry. Compose `variantTitle`
 * from `selectedOptions` the same way `buildAnchorCartLine` does
 * for PDP adds, so the drawer's secondary line reads the same
 * whether the line was server-fetched or optimistically composed.
 */
export function cartToCartLines(cart: RawCart): CartLine[] {
  return cart.lines.nodes.map((node) => {
    const m = node.merchandise;
    const priceCents = toCents(m.price);
    const compareAtCents = m.compareAtPrice ? toCents(m.compareAtPrice) : undefined;
    const variantTitle =
      m.selectedOptions.length > 0
        ? m.selectedOptions
            .filter(
              (o) => !(o.name === "Title" && o.value === "Default Title"),
            )
            .map((o) => `${o.name}: ${o.value}`)
            .join(" / ") || undefined
        : undefined;
    const imageUrl =
      m.image?.url ?? m.product.featuredImage?.url ?? "";
    return {
      id: node.id,
      productId: m.product.id,
      merchandiseId: m.id,
      handle: m.product.handle,
      title: m.product.title,
      imageUrl,
      priceCents,
      compareAtCents:
        compareAtCents !== undefined && compareAtCents > priceCents
          ? compareAtCents
          : undefined,
      currency: m.price.currencyCode,
      quantity: node.quantity,
      variantTitle,
    };
  });
}

/**
 * Project a `RawCart` into the trimmed `Cart` the rest of the app
 * consumes. Centralised so every action returns the same shape
 * without each call-site re-mapping.
 */
export function rawCartToCart(raw: RawCart): Cart {
  return {
    id: raw.id,
    totalQuantity: raw.totalQuantity,
    checkoutUrl: raw.checkoutUrl,
    subtotalCents: toCents(raw.cost.subtotalAmount),
    currency: raw.cost.subtotalAmount.currencyCode,
    countryCode: raw.buyerIdentity.countryCode,
    lines: cartToCartLines(raw),
  };
}

function logUserErrors(label: string, errors: RawUserError[] | undefined): void {
  if (!errors?.length) return;
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[shopify-cart] ${label} userErrors:`,
      errors.map((e) => `${e.code ?? "?"}: ${e.message}`),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch a cart by its Shopify GID. Returns `null` for unknown /
 * expired / checked-out ids — Shopify hands back `cart: null` in
 * each case and we treat them identically (the action layer will
 * call `cartCreate` on a fresh id).
 *
 * `cache: "no-store"` because cart contents change per request;
 * caching even briefly would race the optimistic UI.
 */
export async function fetchCart(cartId: string): Promise<Cart | null> {
  try {
    const data = await shopifyFetch<{ cart: RawCart | null }>(
      CART_QUERY,
      { id: cartId },
      { revalidate: false },
    );
    if (!data.cart) return null;
    return rawCartToCart(data.cart);
  } catch (err) {
    console.error("[shopify-cart] fetchCart failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

interface CartCreateInput {
  lines?: ReadonlyArray<CartLineInput>;
  buyerIdentity?: {
    customerAccessToken?: string;
    email?: string;
    /** Pricing market. When omitted, `cartCreate` stamps the
     *  visitor's resolved market so a cart is always priced in the
     *  local currency from creation. */
    countryCode?: string;
  };
  /** Cart-level attributes stamped at creation time — primarily
   *  the UTM attribution payload so the merge / fresh-cart path
   *  carries campaign tracking from the very first round-trip
   *  (no follow-up `cartAttributesUpdate` needed). */
  attributes?: ReadonlyArray<{ key: string; value: string }>;
}

/**
 * Create a fresh Shopify cart. `lines` populates the cart at
 * creation (used by the login-handoff merge path that wants every
 * guest line attached in one round-trip); leave undefined for an
 * empty cart that subsequent `cartLinesAdd` calls will fill.
 */
export async function cartCreate(input: CartCreateInput): Promise<Cart | null> {
  try {
    /* Always stamp the visitor's market onto the new cart's buyer
     * identity (unless the caller already specified one), so the
     * cart prices in the local currency from line one and checkout
     * charges the same. Merged with any caller-provided token /
     * email rather than replacing it. */
    const country = await getServerCountry();
    const buyerIdentity = {
      ...input.buyerIdentity,
      countryCode: input.buyerIdentity?.countryCode ?? country,
    };
    const data = await shopifyFetch<{
      cartCreate: { cart: RawCart | null; userErrors: RawUserError[] };
    }>(
      CART_CREATE_MUTATION,
      {
        input: {
          lines: input.lines?.map(toLineInputForCreate),
          buyerIdentity,
          ...(input.attributes && input.attributes.length > 0
            ? { attributes: input.attributes }
            : {}),
        },
      },
      { revalidate: false },
    );
    logUserErrors("cartCreate", data.cartCreate.userErrors);
    if (!data.cartCreate.cart) return null;
    return rawCartToCart(data.cartCreate.cart);
  } catch (err) {
    console.error("[shopify-cart] cartCreate failed:", err);
    return null;
  }
}

/* The Cart API's CartLineInput and CartCreate's CartLineInput share
 * the same shape on the wire; this conversion exists so we can
 * massage attributes safely without leaking optional `undefined`
 * keys into the GraphQL variables (the API rejects unknown null
 * keys on some types). */
function toLineInputForCreate(line: CartLineInput) {
  return {
    merchandiseId: line.merchandiseId,
    quantity: line.quantity,
    ...(line.attributes ? { attributes: line.attributes } : {}),
  };
}

export async function cartLinesAdd(
  cartId: string,
  lines: ReadonlyArray<CartLineInput>,
): Promise<Cart | null> {
  try {
    const data = await shopifyFetch<{
      cartLinesAdd: { cart: RawCart | null; userErrors: RawUserError[] };
    }>(
      CART_LINES_ADD_MUTATION,
      { cartId, lines: lines.map(toLineInputForCreate) },
      { revalidate: false },
    );
    logUserErrors("cartLinesAdd", data.cartLinesAdd.userErrors);
    if (!data.cartLinesAdd.cart) return null;
    return rawCartToCart(data.cartLinesAdd.cart);
  } catch (err) {
    console.error("[shopify-cart] cartLinesAdd failed:", err);
    return null;
  }
}

export async function cartLinesUpdate(
  cartId: string,
  lines: ReadonlyArray<{ id: string; quantity: number }>,
): Promise<Cart | null> {
  try {
    const data = await shopifyFetch<{
      cartLinesUpdate: { cart: RawCart | null; userErrors: RawUserError[] };
    }>(
      CART_LINES_UPDATE_MUTATION,
      { cartId, lines },
      { revalidate: false },
    );
    logUserErrors("cartLinesUpdate", data.cartLinesUpdate.userErrors);
    if (!data.cartLinesUpdate.cart) return null;
    return rawCartToCart(data.cartLinesUpdate.cart);
  } catch (err) {
    console.error("[shopify-cart] cartLinesUpdate failed:", err);
    return null;
  }
}

export async function cartLinesRemove(
  cartId: string,
  lineIds: ReadonlyArray<string>,
): Promise<Cart | null> {
  try {
    const data = await shopifyFetch<{
      cartLinesRemove: { cart: RawCart | null; userErrors: RawUserError[] };
    }>(
      CART_LINES_REMOVE_MUTATION,
      { cartId, lineIds },
      { revalidate: false },
    );
    logUserErrors("cartLinesRemove", data.cartLinesRemove.userErrors);
    if (!data.cartLinesRemove.cart) return null;
    return rawCartToCart(data.cartLinesRemove.cart);
  } catch (err) {
    console.error("[shopify-cart] cartLinesRemove failed:", err);
    return null;
  }
}

export async function cartBuyerIdentityUpdate(
  cartId: string,
  buyerIdentity: {
    customerAccessToken?: string;
    email?: string;
    countryCode?: string;
  },
): Promise<Cart | null> {
  try {
    const data = await shopifyFetch<{
      cartBuyerIdentityUpdate: {
        cart: RawCart | null;
        userErrors: RawUserError[];
      };
    }>(
      CART_BUYER_IDENTITY_UPDATE_MUTATION,
      { cartId, buyerIdentity },
      { revalidate: false },
    );
    logUserErrors(
      "cartBuyerIdentityUpdate",
      data.cartBuyerIdentityUpdate.userErrors,
    );
    if (!data.cartBuyerIdentityUpdate.cart) return null;
    return rawCartToCart(data.cartBuyerIdentityUpdate.cart);
  } catch (err) {
    console.error("[shopify-cart] cartBuyerIdentityUpdate failed:", err);
    return null;
  }
}

/**
 * Stamp cart-level attributes onto an existing Shopify cart.
 *
 * Used to attach UTM attribution (`_utm_source`, `_utm_campaign`,
 * etc.) to the cart so the resulting order's `note_attributes`
 * carry the campaign back to the merchant admin. Non-fatal on
 * error — never block the add-to-cart flow if the attribution
 * stamp 500s. The merchandise is on the cart either way; we'd
 * rather lose one row in a marketing report than refuse a sale.
 *
 * Shopify's `cartAttributesUpdate` is *additive on key collision*:
 * passing `{key: "_utm_source", value: "tiktok"}` overwrites
 * whatever was there before for the same key, but leaves other
 * cart attributes (line-level overrides, etc.) untouched. So
 * calling this on every add re-stamps the latest attribution
 * without clobbering anything else.
 */
export async function cartAttributesUpdate(
  cartId: string,
  attributes: ReadonlyArray<{ key: string; value: string }>,
): Promise<Cart | null> {
  if (attributes.length === 0) return null;
  try {
    const data = await shopifyFetch<{
      cartAttributesUpdate: {
        cart: RawCart | null;
        userErrors: RawUserError[];
      };
    }>(
      CART_ATTRIBUTES_UPDATE_MUTATION,
      { cartId, attributes },
      { revalidate: false },
    );
    logUserErrors(
      "cartAttributesUpdate",
      data.cartAttributesUpdate.userErrors,
    );
    if (!data.cartAttributesUpdate.cart) return null;
    return rawCartToCart(data.cartAttributesUpdate.cart);
  } catch (err) {
    console.error("[shopify-cart] cartAttributesUpdate failed:", err);
    return null;
  }
}

/**
 * Resolve to a usable cart for the current shopper.
 *
 *   - Given a `cartId`, fetch it. If it's still alive, return it.
 *   - If the id is missing OR fetches as null (expired, deleted,
 *     completed at checkout), create a fresh cart and return it.
 *   - The fresh-cart path also attaches `customerAccessToken` when
 *     the shopper is signed in, so the new cart belongs to them on
 *     Shopify's side from line one.
 *
 * Returns `null` only on hard infrastructure failure (network,
 * Shopify 5xx). Callers should bubble that as an action failure;
 * the optimistic UI rolls back in that case.
 */
export async function getOrCreateCart(
  cartId: string | null,
  customerAccessToken?: string,
  attributes?: ReadonlyArray<{ key: string; value: string }>,
): Promise<Cart | null> {
  const country = await getServerCountry();
  if (cartId) {
    const existing = await fetchCart(cartId);
    if (existing) {
      /* Reprice on market drift: a returning shopper whose cart was
       * minted under a different country (relocation, VPN) gets the
       * cart's buyer identity updated to their current market, so
       * its prices — and checkout — switch to the local currency.
       * `cartBuyerIdentityUpdate` returns the repriced cart; fall
       * back to the existing one if the update fails so we never
       * drop the shopper's lines over a reprice hiccup. We re-pass
       * the customer token so the country update doesn't detach the
       * cart from the signed-in customer. */
      if (existing.countryCode !== country) {
        const repriced = await cartBuyerIdentityUpdate(cartId, {
          countryCode: country,
          customerAccessToken,
        });
        return repriced ?? existing;
      }
      return existing;
    }
  }
  return cartCreate({
    buyerIdentity: customerAccessToken
      ? { customerAccessToken, countryCode: country }
      : { countryCode: country },
    attributes,
  });
}

/* ------------------------------------------------------------------ */
/* Variant lookup                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve a product handle to the first available variant's GID.
 *
 * Used by the card-add server-action path: cards built from
 * Salespace `SearchProduct` carry no variant info, so when the
 * shopper clicks Add-to-Cart on a single-variant product we need
 * Shopify to tell us which `merchandiseId` to pass. PDP and modal
 * add paths already have a real variant id in hand and skip this.
 *
 * Tagged the same as the product fetcher so a single
 * `revalidateTag("product:<handle>")` purges both — keeps the
 * variant lookup honest when Shopify admin edits a variant set.
 */
const PRODUCT_FIRST_VARIANT_QUERY = /* GraphQL */ `
  query ProductFirstVariant($handle: String!) {
    product(handle: $handle) {
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
  }
`;

export async function resolveFirstVariantGid(
  handle: string,
): Promise<string | null> {
  try {
    const data = await shopifyFetch<{
      product: { variants: { nodes: { id: string }[] } } | null;
    }>(
      PRODUCT_FIRST_VARIANT_QUERY,
      { handle },
      { revalidate: 3600, tags: [`product:${handle}`] },
    );
    return data.product?.variants.nodes[0]?.id ?? null;
  } catch (err) {
    console.error("[shopify-cart] resolveFirstVariantGid failed:", err);
    return null;
  }
}
