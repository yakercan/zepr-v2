import "server-only";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAddressAction } from "@/app/account/addresses/actions";
import { AddressForm } from "@/components/account/address-form";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Add address",
};

/**
 * Create-address page.
 *
 * Auth-gated thin shell — the form lives entirely inside
 * `<AddressForm>`. The server action wired to it
 * (`createAddressAction`) handles validation, the Customer
 * Account API write, revalidation, and the post-save redirect
 * back to `/account/addresses`.
 */
export default async function NewAddressPage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent(
        "/account/addresses/new",
      )}`,
    );
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account/addresses" label="My Addresses" />

      <div className="mt-6 md:mt-8">
        <AddressForm
          action={createAddressAction}
          heading="Add a new address"
          submitLabel="Add address"
        />
      </div>
    </main>
  );
}
