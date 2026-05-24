import "server-only";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateProfileAction } from "@/app/account/profile/edit/actions";
import { ProfileForm } from "@/components/account/profile-form";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Edit profile",
};

/**
 * Edit-profile page.
 *
 * Auth-gated thin shell — the form lives inside `<ProfileForm>`,
 * which is bound to the `updateProfileAction` server action.
 * Initial values come straight from the session's OIDC claims;
 * no extra Customer Account API round-trip is needed because
 * the session cookie is always at least as fresh as the last
 * sign-in, and the action re-seals it on save anyway.
 *
 * Matches the addresses-edit page's shape (back link, single
 * card, redirect to dashboard on success) so the two account
 * sub-pages feel like one consistent pattern.
 */
export default async function EditProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent(
        "/account/profile/edit",
      )}`,
    );
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account" label="My Account" />

      <div className="mt-6 md:mt-8">
        <ProfileForm
          action={updateProfileAction}
          initialValues={{
            firstName: session.customer.firstName ?? "",
            lastName: session.customer.lastName ?? "",
          }}
          email={session.customer.email}
        />
      </div>
    </main>
  );
}
