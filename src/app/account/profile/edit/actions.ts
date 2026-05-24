"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, setSession } from "@/lib/auth/session";
import { updateCustomerProfile } from "@/lib/shopify/customer-account-queries";

/**
 * Server action backing `/account/profile/edit`.
 *
 * Two writes per call, in order:
 *
 *   1. `customerUpdate` against Shopify — source of truth.
 *   2. Re-seal the session cookie with the saved names so the
 *      dashboard's "Welcome back" greeting + the `ProfileCard`
 *      reflect the change immediately. The OIDC `id_token`
 *      claims that originally seeded the cookie don't refresh
 *      until the next sign-in, so without this step the UI
 *      would lie until the shopper logged out and back in.
 *
 * If step 1 fails (transport error or `userErrors` from
 * Shopify) we surface the message inline; the session cookie
 * stays untouched so we can never get into a state where the
 * UI claims the save worked but Shopify holds the old values.
 *
 * On success the action redirects back to the dashboard. The
 * dashboard's `revalidatePath` call below makes sure the page
 * fetches fresh against any other dependencies (none today,
 * but the orders / address cards live there too) before paint.
 */

export type ProfileActionState =
  | { status: "idle" }
  | { status: "error"; error: string };

const IDLE: ProfileActionState = { status: "idle" };

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await getSession();
  if (!session) {
    /* The page-level guard catches anon shoppers before they
     * reach the form, but server actions are reachable from
     * any client — the real auth check belongs here. */
    redirect(
      `/account/login?return_to=${encodeURIComponent(
        "/account/profile/edit",
      )}`,
    );
  }

  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const firstName = read("firstName");
  const lastName = read("lastName");

  let result;
  try {
    result = await updateCustomerProfile({ firstName, lastName });
  } catch (err) {
    console.error("[account/profile] update failed:", err);
    return {
      status: "error",
      error: "Something went wrong. Please try again.",
    };
  }
  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  /* Re-seal the cookie off the values Shopify *actually*
   * persisted (which may have been trimmed / case-normalised
   * server-side) rather than the raw form input. Keeps the
   * cookie and Shopify byte-identical until the next OIDC
   * refresh cycle replaces both. */
  await setSession({
    ...session,
    customer: {
      ...session.customer,
      firstName: result.firstName ?? undefined,
      lastName: result.lastName ?? undefined,
    },
  });

  revalidatePath("/account");
  redirect("/account");
  /* Unreachable — `redirect()` throws a `NEXT_REDIRECT` sentinel
   * the action runtime catches. Kept here as a typing hint and
   * to remind future editors that no state should be returned
   * on the success path. */
  return IDLE;
}
