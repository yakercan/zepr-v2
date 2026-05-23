import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatenate Tailwind class names with conflict resolution. Standard
 * `cn(...)` helper used across the app — pass any mix of strings,
 * arrays, and objects (clsx semantics) and `tailwind-merge` will dedupe
 * conflicting utilities (e.g. `px-2` vs `px-4` → keeps the last one).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a money amount as a localized currency string. Accepts the
 * Shopify shape (string amount + ISO currency) and falls back to a
 * sensible USD-style format on parse failure so a bad value never
 * throws into the React tree.
 */
export function formatMoney(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Discount percentage from price + compareAt. Returns `null` when there
 * is no meaningful discount (covers `null` / `0` / `compareAt <= price`)
 * so callers can short-circuit on `if (!discount) return`.
 */
export function discountPercent(
  price: string | number,
  compareAt: string | number | null | undefined,
): number | null {
  const p = typeof price === "number" ? price : Number.parseFloat(price);
  const c =
    compareAt == null
      ? 0
      : typeof compareAt === "number"
        ? compareAt
        : Number.parseFloat(compareAt);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}
