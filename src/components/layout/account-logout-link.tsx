"use client";

import type { ReactNode } from "react";
import { snapshotServerCartToStorage } from "@/lib/cart/store";

interface AccountLogoutLinkProps {
  children: ReactNode;
  className?: string;
}

/**
 * Plain `/account/logout` link with a synchronous client-side
 * `onClick` that snapshots the server-mode cart into
 * `localStorage`. Mirrors `AccountLogoutItem` but for callers
 * outside the dropdown (e.g. the "Sign out" link in the account
 * dashboard header). See `snapshotServerCartToStorage` for the
 * full rationale and guest-mode no-op guarantee.
 */
export function AccountLogoutLink({
  children,
  className,
}: AccountLogoutLinkProps) {
  return (
    <a
      href="/account/logout"
      onClick={() => snapshotServerCartToStorage()}
      className={className}
    >
      {children}
    </a>
  );
}
