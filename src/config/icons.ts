/**
 * Brand/CDN icon URLs. Centralised so they stay consistent across the
 * header, product cards, badges, PDP — wherever they appear. The CDN
 * is the same `cdn.salespace.com` host the original zepr storefront
 * uses, so swapping in different artwork is a one-line edit.
 */
export const ZEPR_ICONS = {
  fire: "https://cdn.salespace.com/media/icons/fire.png",
  fireBlack: "https://cdn.salespace.com/media/icons/fire_black.png",
  fireOrange: "https://cdn.salespace.com/media/icons/fire_orange.png",
  fireHd: "https://cdn.salespace.com/media/icons/fire_hd.png",
  topRatedOrange: "https://cdn.salespace.com/media/icons/toprated_orange.png",
  shipping: "https://cdn.salespace.com/media/icons/shipping.png",
  shippingDark: "https://cdn.salespace.com/media/icons/shipping_dark.png",
  shippingLight: "https://cdn.salespace.com/media/icons/shipping_light.png",
  medal: "https://cdn.salespace.com/media/icons/medal.png",
  noResults: "https://cdn.salespace.com/media/icons/noresults.svg",
  favicon: "https://cdn.salespace.com/zepr-favicon.png",
} as const;

export type ZeprIconKey = keyof typeof ZEPR_ICONS;
export type ZeprIconSrc = (typeof ZEPR_ICONS)[ZeprIconKey];
