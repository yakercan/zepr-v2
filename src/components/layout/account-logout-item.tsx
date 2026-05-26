"use client";

import { DropdownItem } from "@/components/ui/dropdown";
import { snapshotServerCartToStorage } from "@/lib/cart/store";
import { cn } from "@/lib/utils";

/**
 * Logout row for the header account dropdown.
 *
 * Has to live in its own client file because the rest of the
 * `AccountDropdown` panel is server-rendered (it `await`s the
 * session) and server components can't pass functions across the
 * boundary — and the only reason this row needs a function is
 * the `onClick` that snapshots the server cart into
 * `localStorage` just before the navigation to `/account/logout`
 * tears down the JS context.
 *
 * The snapshot itself is a no-op in guest mode, so attaching it
 * here is safe regardless of how the panel was rendered.
 */
export function AccountLogoutItem() {
  return (
    <DropdownItem
      href="/account/logout"
      icon={<LogoutIcon />}
      variant="danger"
      onClick={() => snapshotServerCartToStorage()}
    >
      Logout
    </DropdownItem>
  );
}

interface SvgProps {
  className?: string;
}

function LogoutIcon({ className }: SvgProps) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
    </svg>
  );
}
