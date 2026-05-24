"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  updateCustomerAddress,
} from "@/lib/shopify/customer-account-queries";
import type { CustomerAddressInput } from "@/lib/shopify/customer-account-types";

/**
 * Server actions backing the `/account/addresses` CRUD surface.
 *
 * Each action wraps one Customer Account API mutation behind the
 * same envelope (`AddressActionState`) so the `<AddressForm>`
 * client island has one shape to render — pending, success, or
 * one human-readable error message under the submit button.
 *
 * Flow:
 *
 *   - Create / Update: redirect to `/account/addresses` on
 *     success so the freshly-saved card shows up in the list as
 *     the confirmation signal (no toast layer needed yet).
 *   - Delete / Set-default: stay on the list page and just
 *     `revalidatePath` so the row vanishes or the "Default" pill
 *     hops without a navigation flash.
 *
 * Every action revalidates *both* `/account/addresses` (the list)
 * and `/account` (the dashboard's default-address card) so a
 * shopper jumping back to the dashboard after a save sees the
 * fresh state without a hard refresh.
 *
 * Auth is enforced inside each action — actions are
 * server-callable from any client, not just our pages, so the
 * session check here is the real gate (the page-level
 * `getSession()` is just a redirect convenience).
 */

/** Shared result envelope. Mirrors `AddressMutationResult` from
 *  the queries module but adds an idle / pending phase so
 *  `useActionState` can render three states off one variable:
 *  initial, error, and (briefly) success — though success paths
 *  here mostly redirect away. */
export type AddressActionState =
  | { status: "idle" }
  | { status: "error"; error: string };

const IDLE: AddressActionState = { status: "idle" };

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

async function requireSession() {
  const session = await getSession();
  if (!session) {
    /* Should be unreachable from the UI (the page-level guard
     * redirects unauthenticated shoppers away first), but server
     * actions can be called directly so this is the real check. */
    redirect(
      `/account/login?return_to=${encodeURIComponent("/account/addresses")}`,
    );
  }
}

/** Pull the form's string fields into a `CustomerAddressInput`.
 *  Centralised so create + update read the same shape and a new
 *  field is added in exactly one place. */
function readAddressInput(formData: FormData): CustomerAddressInput {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    firstName: read("firstName"),
    lastName: read("lastName"),
    address1: read("address1"),
    address2: read("address2"),
    city: read("city"),
    zoneCode: read("zoneCode"),
    territoryCode: read("territoryCode"),
    zip: read("zip"),
    phoneNumber: read("phoneNumber"),
  };
}

/** Wire-shaped checkbox reader. Native form checkboxes only
 *  submit a value when checked — an unchecked box drops the key
 *  entirely, so `formData.get(key) === "on"` is the right test. */
function readBool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** Translate transport-layer errors (network down, Shopify 5xx,
 *  malformed GraphQL) into a friendly message the form can
 *  surface. We don't leak the raw error to the shopper — it
 *  goes to the server log instead so ops can diagnose. */
function unexpectedFailure(
  scope: string,
  err: unknown,
): AddressActionState {
  console.error(`[account/addresses] ${scope} failed:`, err);
  return {
    status: "error",
    error: "Something went wrong. Please try again.",
  };
}

/** After every successful mutation, refresh the two surfaces
 *  that show address data so neither shows a stale row. */
function revalidateAddressSurfaces() {
  revalidatePath("/account/addresses");
  revalidatePath("/account");
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createAddressAction(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  await requireSession();
  const input = readAddressInput(formData);
  const defaultAddress = readBool(formData, "defaultAddress");

  let result;
  try {
    result = await createCustomerAddress(input, defaultAddress);
  } catch (err) {
    return unexpectedFailure("create", err);
  }
  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  revalidateAddressSurfaces();
  redirect("/account/addresses");
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

/** Edit form binds `addressId` via `.bind(null, id)` so the
 *  client never has to round-trip it through a hidden input. */
export async function updateAddressAction(
  addressId: string,
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  await requireSession();
  const input = readAddressInput(formData);
  /* `defaultAddress` on the edit form is a checkbox just like
   *  on create. `null` would tell Shopify "leave the default
   *  flag alone", but the form always submits the current value
   *  (checked or not), so we pass an explicit boolean. */
  const defaultAddress = readBool(formData, "defaultAddress");

  let result;
  try {
    result = await updateCustomerAddress(addressId, input, defaultAddress);
  } catch (err) {
    return unexpectedFailure("update", err);
  }
  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  revalidateAddressSurfaces();
  redirect("/account/addresses");
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

/** Inline list-page action — the row's "Delete" button posts to
 *  this and the page revalidates. Returns the same envelope so
 *  the row could surface an error (rare; usually only when an
 *  address has been referenced in a draft order). */
export async function deleteAddressAction(
  addressId: string,
  _prev: AddressActionState,
): Promise<AddressActionState> {
  await requireSession();

  let result;
  try {
    result = await deleteCustomerAddress(addressId);
  } catch (err) {
    return unexpectedFailure("delete", err);
  }
  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  revalidateAddressSurfaces();
  return IDLE;
}

/* ------------------------------------------------------------------ */
/* Set default                                                         */
/* ------------------------------------------------------------------ */

/** "Make default" is a degenerate `customerAddressUpdate` call
 *  with no address fields and `defaultAddress: true` — Shopify's
 *  schema accepts `address: null` for exactly this case, so we
 *  send nothing else. Cleaner than a dedicated
 *  `customerDefaultAddressUpdate` and matches the API surface. */
export async function setDefaultAddressAction(
  addressId: string,
  _prev: AddressActionState,
): Promise<AddressActionState> {
  await requireSession();

  let result;
  try {
    result = await updateCustomerAddress(addressId, null, true);
  } catch (err) {
    return unexpectedFailure("set-default", err);
  }
  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  revalidateAddressSurfaces();
  return IDLE;
}
