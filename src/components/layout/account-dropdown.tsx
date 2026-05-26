import Link from "next/link";
import { AccountLogoutItem } from "@/components/layout/account-logout-item";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { UserIcon } from "@/components/ui/icons";
import { getAuthState } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Account dropdown — desktop header trigger.
 *
 * Async server component. Resolves the shopper's session once
 * (cheap — `getAuthState` is wrapped in React's `cache()` so the
 * decrypt is shared with anything else in the tree that asks)
 * and renders the right panel directly into the initial HTML —
 * no client flicker between guest and signed-in shells.
 *
 * The host `<Dropdown>` is a Client Component for the
 * open/close + click-outside / Escape choreography, but it
 * happily accepts server-rendered children, so all the auth-
 * dependent content stays on the server.
 *
 * Branching:
 *
 *   - **guest**     — primary "Sign in / Register" CTA wired to
 *                     `/account/login`, then a "DISCOVER" section
 *                     (Wishlist, Order Tracking, Returns, Contact,
 *                     FAQ).
 *   - **signed-in** — two columns: "MY ACCOUNT" (Dashboard,
 *                     Profile, Orders, My Addresses, Logout) and
 *                     "HELP & INFO" (Wishlist, Tracking, Returns,
 *                     Contact, FAQ).
 *
 * Every `/account/*` link is live today (Dashboard, Profile
 * anchor, Orders list, Addresses CRUD, Logout). The
 * `DiscoverItems` group (Favorites, Order Tracking, Returns,
 * Contact, FAQ) is still partly placeholder — those pages land
 * in later steps.
 */
export async function AccountDropdown() {
  const { isLoggedIn } = await getAuthState();

  return (
    <Dropdown
      align="right"
      panelClassName={isLoggedIn ? "w-[28rem] p-2" : "w-[20rem] p-3"}
      ariaLabel="Account"
      trigger={
        <>
          <UserIcon className="text-[color:var(--color-ink)]" />
          <span className="text-[15px] font-semibold">
            {isLoggedIn ? "My Account" : "Sign in / Register"}
          </span>
          {isLoggedIn && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
            />
          )}
        </>
      }
    >
      {isLoggedIn ? <AccountPanelLoggedIn /> : <AccountPanelGuest />}
    </Dropdown>
  );
}

/* ------------------------------------------------------------------ */
/* Guest                                                               */
/* ------------------------------------------------------------------ */

function AccountPanelGuest() {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/account/login" className="btn-primary w-full">
        Sign in / Register
      </Link>

      <SectionHeader>Discover</SectionHeader>
      <DiscoverItems />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signed in                                                           */
/* ------------------------------------------------------------------ */

function AccountPanelLoggedIn() {
  return (
    <div className="grid grid-cols-2 gap-1">
      <div>
        <SectionHeader>My Account</SectionHeader>
        <DropdownItem href="/account" icon={<DashIcon />}>
          Dashboard
        </DropdownItem>
        <DropdownItem href="/account#details" icon={<ProfileIcon />}>
          Profile
        </DropdownItem>
        <DropdownItem href="/account/orders" icon={<OrdersIcon />}>
          Orders
        </DropdownItem>
        <DropdownItem href="/account/addresses" icon={<AddressIcon />}>
          My Addresses
        </DropdownItem>
        <AccountLogoutItem />
      </div>

      <div>
        <SectionHeader>Help & Info</SectionHeader>
        <DiscoverItems />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared item groups                                                  */
/* ------------------------------------------------------------------ */

function DiscoverItems() {
  return (
    <>
      <DropdownItem href="/favorites" icon={<WishlistIcon />}>
        Favorites
      </DropdownItem>
      <DropdownItem href="/order-tracking" icon={<TrackingIcon />}>
        Order Tracking
      </DropdownItem>
      <DropdownItem href="/returns" icon={<ReturnIcon />}>
        Return Request
      </DropdownItem>
      <DropdownItem href="/pages/contact" icon={<ContactIcon />}>
        Contact
      </DropdownItem>
      <DropdownItem href="/pages/faq" icon={<FAQIcon />}>
        FAQ
      </DropdownItem>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-1 border-b border-[color:var(--color-border)] px-3 py-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-muted)]">
        {children}
      </h3>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Item-level icons (inline SVG — same look as zepr's account menu)    */
/* ------------------------------------------------------------------ */

interface SvgProps {
  className?: string;
}

const SVG_BASE_PROPS = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

const ICON_CLASS = "h-4 w-4 shrink-0 text-[color:var(--color-ink-muted)]";

function DashIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ProfileIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
    </svg>
  );
}

function OrdersIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function AddressIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
      <path d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
}

function WishlistIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M4.318 6.318a4.5 4.5 0 0 0 0 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 0 0-6.364 0z" />
    </svg>
  );
}

function TrackingIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
    </svg>
  );
}

function ReturnIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function ContactIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M3 8l7.89 4.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
    </svg>
  );
}

function FAQIcon({ className }: SvgProps) {
  return (
    <svg {...SVG_BASE_PROPS} className={cn(ICON_CLASS, className)}>
      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}
