import "server-only";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { updateAddressAction } from "@/app/account/addresses/actions";
import { AddressForm } from "@/components/account/address-form";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";
import { fetchAddresses } from "@/lib/shopify/customer-account-queries";

export const metadata: Metadata = {
  title: "Edit address",
};

interface EditAddressPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit-address page.
 *
 * Auth-gated. Fetches the full address list once to find the
 * target by id (no per-address query exists on Customer Account
 * API today — `customer.addresses` is the only entry point —
 * and the cap of 50 addresses keeps this O(n) lookup cheap).
 *
 * URL contract: the dynamic `[id]` segment carries the *short
 * numeric* id (e.g. `9341326524494`), not the raw GID. Encoded
 * forward slashes inside a single dynamic segment trip up
 * Turbopack's matcher and 404 the route intermittently — same
 * reason the orders detail page chose the short-id convention.
 * This page rebuilds the full `gid://shopify/CustomerAddress/…`
 * before talking to Shopify so the lookup + bound mutation
 * still receive the canonical id.
 *
 * `notFound()` covers two cases:
 *
 *   - The id in the URL was tampered with / belongs to a
 *     different customer.
 *   - The address was deleted between the list render and the
 *     edit click (a window measured in seconds, but still
 *     real). Either way the shopper sees the standard 404
 *     instead of a partially-filled form.
 *
 * The submit action is `updateAddressAction.bind(null, gid)` so
 * the (full) address id rides on the server action itself
 * rather than a hidden form field — same pattern as the delete
 * + set-default buttons on the list page.
 */
export default async function EditAddressPage({
  params,
}: EditAddressPageProps) {
  const { id: numericId } = await params;
  const gid = `gid://shopify/CustomerAddress/${numericId}`;

  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent(
        `/account/addresses/${numericId}/edit`,
      )}`,
    );
  }

  let addresses;
  let defaultAddressId: string | null = null;
  try {
    const data = await fetchAddresses();
    addresses = data.addresses;
    defaultAddressId = data.defaultAddressId;
  } catch (err) {
    console.error("[account] addresses fetch for edit failed:", err);
    notFound();
  }

  const target = addresses.find((a) => a.id === gid);
  if (!target) notFound();

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account/addresses" label="My Addresses" />

      <div className="mt-6 md:mt-8">
        <AddressForm
          action={updateAddressAction.bind(null, gid)}
          heading="Edit address"
          submitLabel="Save changes"
          initialValues={{
            firstName: target.firstName ?? "",
            lastName: target.lastName ?? "",
            address1: target.address1 ?? "",
            address2: target.address2 ?? "",
            city: target.city ?? "",
            zoneCode: target.zoneCode ?? "",
            territoryCode: target.territoryCode ?? "",
            zip: target.zip ?? "",
            phoneNumber: target.phoneNumber ?? "",
          }}
          initialIsDefault={target.id === defaultAddressId}
        />
      </div>
    </main>
  );
}
