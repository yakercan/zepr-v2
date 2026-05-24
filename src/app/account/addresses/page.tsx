import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/account/addresses/actions";
import { AddressCardActions } from "@/components/account/address-card-actions";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";
import {
  type CustomerAddress,
  extractGidId,
  fetchAddresses,
} from "@/lib/shopify/customer-account-queries";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/* Auto-fill grid with a 280px minimum tile width — cards reflow
 * to fill the row based on container width instead of jumping
 * between fixed 1-col / 2-col breakpoints. Same "free fill"
 * dialect the storefront uses for any list of similarly-sized
 * tiles; 280px keeps a typical four-line address comfortable
 * without going so narrow that "Set as default" wraps. */
const ADDRESS_GRID_COLS =
  "[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]";

export const metadata: Metadata = {
  title: "My Addresses",
};

/**
 * Saved addresses list — the home of the addresses CRUD surface.
 *
 * Layout:
 *
 *   1. Back nav to the dashboard (matches the orders list shell).
 *   2. Page header with the "Add new address" CTA on the right.
 *   3. One card per saved address. The default card glows in
 *      brand orange — orange border plus a floating "DEFAULT"
 *      pill straddling the top-left edge (same dialect as the
 *      PDP tiered-offer "Best value" badge, just anchored
 *      left so it doesn't crowd the right-edge action cluster).
 *      Each card's footer carries the row's mutation entry
 *      points: Set as default (left), Edit + Delete clustered
 *      right; Delete prompts the shared `<ConfirmDialog>`.
 *
 * One Customer Account API read up front. The mutations live
 * behind server actions (`./actions.ts`) and `revalidatePath`
 * back into this route on success, so the page re-renders with
 * the fresh list without an extra round-trip from the client.
 */
export default async function AddressesPage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent("/account/addresses")}`,
    );
  }

  let addresses: CustomerAddress[] | null;
  let defaultAddressId: string | null = null;
  try {
    const data = await fetchAddresses();
    addresses = data.addresses;
    defaultAddressId = data.defaultAddressId;
  } catch (err) {
    console.error("[account] addresses fetch failed:", err);
    addresses = null;
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account" label="My Account" />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-3 md:mt-6">
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
          My Addresses
        </h1>
        <Link href="/account/addresses/new" className="btn-primary">
          Add new address
        </Link>
      </header>

      <section className="mt-8 md:mt-10">
        {addresses === null ? (
          <EmptyShell>
            We couldn&apos;t load your addresses right now. Please try again
            shortly.
          </EmptyShell>
        ) : addresses.length === 0 ? (
          <EmptyShell>
            No saved addresses yet. Add your first one so checkout pre-fills
            it next time.
          </EmptyShell>
        ) : (
          <ul className={cn("grid gap-4 md:gap-6", ADDRESS_GRID_COLS)}>
            {addresses.map((address) => (
              <li key={address.id ?? `${address.address1}-${address.zip}`}>
                <AddressCard
                  address={address}
                  isDefault={address.id === defaultAddressId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function AddressCard({
  address,
  isDefault,
}: {
  address: CustomerAddress;
  isDefault: boolean;
}) {
  /* The card uses `address.id` for both routing (Edit link) and
   *  mutation binding (Delete / Set default). Live addresses
   *  always carry one — the only `null` case is the snapshot on
   *  an order's shipping address, which never reaches this
   *  surface — but the optional chaining stays as a safety net. */
  const id = address.id;

  return (
    <article
      className={cn(
        PANEL_SURFACE_THIN_CLASSES,
        /* `relative` carries the floating "Default" badge's
         *  absolute anchor. The shared thin panel paints a 1px
         *  regular-grey border; the default variant just swaps
         *  the colour to the brand orange glow — `cn`
         *  (tailwind-merge) keeps the width, only overrides
         *  the colour. */
        "relative flex h-full flex-col gap-4 p-5 md:p-6",
        isDefault && "border-[color:var(--color-brand)]",
      )}
    >
      {isDefault && <DefaultBadge />}

      {/* Address copy + Edit share one flex row so Edit lands
          at the top-right of the card without reserving an
          empty header row above it — the badge takes care of
          the "this is default" cue on the top border, leaving
          the card's top padding entirely to content. */}
      <div className="flex items-start justify-between gap-3">
        <FormattedAddress address={address} />
        {id && (
          <Link
            href={`/account/addresses/${extractGidId(id)}/edit`}
            className="shrink-0 text-sm font-semibold text-[color:var(--color-ink-secondary)] transition-colors hover:text-[color:var(--color-ink)]"
          >
            Edit
          </Link>
        )}
      </div>

      {id && (
        <footer className="mt-auto pt-2">
          <AddressCardActions
            isDefault={isDefault}
            deleteAction={deleteAddressAction.bind(null, id)}
            setDefaultAction={setDefaultAddressAction.bind(null, id)}
          />
        </footer>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Floating "Default" badge                                            */
/* ------------------------------------------------------------------ */

/**
 * Brand-orange pill pinned to the *top-left* border of the
 * default-address card.
 *
 * Visual dialect deliberately mirrors the tiered-offer "Best
 * value" badge on the PDP — same `-translate-y-1/2` border
 * straddle, same `rounded-full px-2 py-0.5` pill shape, same
 * `text-[10px] font-bold uppercase` glyph — so the storefront's
 * "this one's featured" language reads identically across
 * surfaces. Only the anchor flips: tiered offers use top-right,
 * addresses use top-left so the badge doesn't crowd the
 * right-edge action cluster (Edit / Delete) further down the
 * card.
 *
 * `pointer-events-none` so the chip never intercepts a click
 * meant for the card content or the Edit link beneath it.
 */
function DefaultBadge() {
  return (
    <span
      className="pointer-events-none absolute left-4 top-0 -translate-y-1/2 whitespace-nowrap rounded-full bg-[color:var(--color-brand)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
      aria-label="Default address"
    >
      Default
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Formatted address — same line stack the dashboard uses              */
/* ------------------------------------------------------------------ */

function FormattedAddress({ address }: { address: CustomerAddress }) {
  const recipientName = [address.firstName, address.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  /* Build the line stack in render order so the JSX stays a flat
   * list — easier to scan than nested optional fragments and
   * keeps the format identical to the dashboard's
   * `<FormattedAddress>` rendering for visual consistency. */
  const lines = [
    recipientName || null,
    address.address1,
    address.address2,
    [address.city, address.province, address.zip]
      .filter(Boolean)
      .join(", ") || null,
    address.country,
    address.phoneNumber,
  ].filter((line): line is string => Boolean(line && line.trim().length > 0));

  return (
    <address className="not-italic text-sm leading-relaxed text-[color:var(--color-ink)]">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / error shell                                                 */
/* ------------------------------------------------------------------ */

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(PANEL_SURFACE_THIN_CLASSES, "p-6 md:p-8")}>
      <p className="text-sm text-[color:var(--color-ink-muted)]">{children}</p>
    </div>
  );
}
