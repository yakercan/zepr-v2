import Link from "next/link";
import { InfoTooltip } from "@/components/products/info-tooltip";
import { ExternalLinkIcon } from "@/components/ui/icons";

/**
 * PDP trust strip — the three "feel safe buying here" badges
 * (money-back guarantee, secure checkout, customer support)
 * that sit below the Buy Now CTA + Shop Pay installment promise.
 *
 * Each badge is a `[green circle icon] [title (+ optional info)
 * + body line]` row. The 30-day guarantee carries an InfoTooltip
 * with the full policy copy on hover/focus; the 7/24 support row
 * carries an external link to the contact page so a shopper can
 * jump straight to a support form without losing their cart
 * configuration.
 *
 * The component owns its top hairline divider so the call site
 * only needs to drop it in — slipping it under the Shop Pay
 * badge in `<BuyActions>`'s parent (the BuyForm) inherits the
 * "section after the buy stack" look automatically.
 *
 * Pure presentation; no props needed because every badge's copy
 * is global (not product-specific). If a future merchandising
 * rule wants per-product overrides (e.g. "no free returns on
 * clearance"), the component grows props at that point — for
 * now keeping the surface flat lets every PDP show the same
 * trust set with zero plumbing.
 */
export function TrustBadges({ className }: { className?: string }) {
  return (
    <section
      aria-label="Buyer protection"
      className={[
        "flex flex-col gap-4 border-t border-[color:var(--color-border)] pt-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Badge
        icon={<ShieldCheckGlyph />}
        title="30-Day Money-Back Guarantee"
        body="Hassle-free returns with full refund eligibility."
        tooltip={{
          title: "30-Day Money-Back Guarantee",
          description:
            "Try 30 days risk-free! Easy and free returns. If you're not satisfied, get your money back—no questions asked. For health and safety reasons, hygiene products are eligible for full refund if the product is unused, damaged or not as described.",
        }}
      />
      <Badge
        icon={<LockGlyph />}
        title="Secure & Encrypted Checkout"
        body="Your payment information is protected at all times."
      />
      <Badge
        icon={<HeadsetGlyph />}
        title="7/24 Customer Support"
        body="We're here to help anytime you need us."
        action={
          <Link
            href="/pages/contact"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contact us"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-success)]"
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </Link>
        }
      />
    </section>
  );
}

/* ---------- One badge row ---------- */

interface BadgeProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Optional trailing affordance pinned to the right side of the
   *  title row — used by the 7/24 support badge for the contact-
   *  page link. */
  action?: React.ReactNode;
  /** Optional tooltip on the title — renders an info button to
   *  the right of the title that reveals the full description on
   *  hover/focus. Mutually exclusive with `action`; the 30-day
   *  guarantee uses this. */
  tooltip?: { title: string; description: string };
}

function Badge({ icon, title, body, action, tooltip }: BadgeProps) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-success)] text-white"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
            {title}
          </h3>
          {tooltip ? <InfoTooltip {...tooltip} /> : action}
        </div>
        <p className="text-sm text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </div>
  );
}

/* ---------- Filled-on-coloured-disc glyphs ----------
 *
 * These three icons don't follow the storefront's standard
 * `currentColor`-stroked outline convention because they're
 * meant to sit on the green disc with crisp white shapes inside.
 * Module-private; if another surface ever needs them they can
 * lift to `components/ui/icons.tsx` at that point. */

function ShieldCheckGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.944c2.9 1.026 5.894 1.713 8.618 3.04.253.964.382 1.974.382 3.016 0 5.591-3.824 10.29-9 11.622-5.176-1.332-9-6.03-9-11.622 0-1.042.133-2.052.382-3.016C6.106 4.657 9.1 3.97 12 2.944z"
        fill="white"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="var(--color-success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" fill="white" />
      <path
        d="M8 11V7a4 4 0 018 0v4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1" fill="var(--color-success)" />
      <line
        x1="12"
        y1="17"
        x2="12"
        y2="18"
        stroke="var(--color-success)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeadsetGlyph() {
  /* Verbatim port of the legacy storefront's customer-service
   * glyph — a headset with a speech bubble + three dots
   * underneath. `currentColor` so the white disc parent
   * (`text-white`) tints it; the viewBox / path stays identical
   * to keep pixel-for-pixel parity with the existing brand. */
  return (
    <svg
      className="h-4 w-4 text-white"
      fill="currentColor"
      viewBox="0 0 768 768"
      aria-hidden
    >
      <path d="M 753.773438 406.296875 L 753.773438 385.859375 C 753.773438 368.316406 740.980469 353.027344 722.007812 344.792969 L 722.007812 308.820312 C 730.785156 308.820312 737.84375 303.382812 737.449219 296.863281 C 733.53125 231.097656 697.207031 169.640625 634.167969 122.792969 C 567.351562 73.148438 478.480469 45.753906 384.019531 45.753906 C 289.511719 45.753906 200.636719 73.148438 133.824219 122.792969 C 70.832031 169.640625 34.511719 231.097656 30.589844 296.863281 C 30.195312 303.382812 37.253906 308.820312 46.03125 308.820312 L 46.03125 344.792969 C 27.011719 353.027344 14.214844 368.316406 14.214844 385.859375 L 14.214844 406.296875 C 6.371094 406.296875 0 411.050781 0 416.882812 L 0 488.53125 C 0 494.363281 6.371094 499.066406 14.214844 499.066406 L 14.214844 519.550781 C 14.214844 545.769531 42.792969 566.988281 78.039062 566.988281 L 90.050781 566.988281 L 90.050781 566.109375 C 93.773438 573.898438 103.773438 579.535156 115.589844 579.535156 L 123.429688 579.535156 C 138.429688 579.535156 150.589844 570.519531 150.589844 559.34375 L 150.589844 346.019531 C 150.589844 334.894531 138.429688 325.875 123.429688 325.875 L 115.589844 325.875 C 103.773438 325.875 93.773438 331.460938 90.050781 339.304688 L 90.050781 338.371094 L 78.039062 338.371094 C 77.890625 338.371094 77.746094 338.371094 77.597656 338.371094 L 77.597656 308.820312 L 78.332031 308.820312 C 86.617188 308.820312 93.332031 303.96875 93.773438 297.84375 C 101.46875 183.757812 228.726562 92.75 384.019531 92.75 C 539.265625 92.75 666.519531 183.757812 674.214844 297.84375 C 674.65625 303.96875 681.371094 308.820312 689.65625 308.820312 L 690.390625 308.820312 L 690.390625 338.371094 C 690.246094 338.371094 690.097656 338.371094 689.949219 338.371094 L 677.988281 338.371094 L 677.988281 339.304688 C 674.214844 331.460938 664.214844 325.875 652.402344 325.875 L 644.558594 325.875 C 629.558594 325.875 617.402344 334.894531 617.402344 346.019531 L 617.402344 559.34375 C 617.402344 570.519531 629.558594 579.535156 644.558594 579.535156 L 652.402344 579.535156 C 664.214844 579.535156 674.214844 573.898438 677.988281 566.109375 L 677.988281 566.988281 L 689.949219 566.988281 C 693.382812 566.988281 696.765625 566.792969 700.097656 566.402344 L 700.097656 597.324219 C 700.097656 642.410156 686.175781 678.972656 625.488281 678.972656 L 543.53125 678.972656 L 543.53125 678.382812 C 543.53125 667.550781 534.070312 658.78125 522.351562 658.78125 L 437.648438 658.78125 C 425.980469 658.78125 416.46875 667.550781 416.46875 678.382812 L 416.46875 703.082031 C 416.46875 713.863281 425.980469 722.636719 437.648438 722.636719 L 522.351562 722.636719 C 534.070312 722.636719 543.53125 713.863281 543.53125 703.082031 L 543.53125 702.445312 L 625.488281 702.445312 C 703.628906 702.445312 731.667969 655.398438 731.667969 597.324219 L 731.667969 555.425781 C 745.195312 546.75 753.773438 533.910156 753.773438 519.550781 L 753.773438 499.066406 C 761.617188 499.066406 767.988281 494.363281 767.988281 488.53125 L 767.988281 416.882812 C 767.988281 411.050781 761.617188 406.296875 753.773438 406.296875 M 515.882812 241.535156 L 250.832031 241.535156 C 210.539062 241.535156 177.890625 274.222656 177.890625 314.457031 L 177.890625 534.988281 C 177.890625 560.324219 190.785156 582.625 210.390625 595.707031 L 195 722.636719 L 286.960938 607.910156 L 515.882812 607.910156 C 556.226562 607.910156 588.871094 575.273438 588.871094 534.988281 L 588.871094 314.457031 C 588.871094 274.222656 556.226562 241.535156 515.882812 241.535156 Z M 273.773438 454.46875 C 260.148438 454.46875 249.117188 443.394531 249.117188 429.769531 C 249.117188 416.195312 260.148438 405.121094 273.773438 405.121094 C 287.402344 405.121094 298.429688 416.195312 298.429688 429.769531 C 298.429688 443.394531 287.402344 454.46875 273.773438 454.46875 Z M 386.324219 454.46875 C 372.746094 454.46875 361.667969 443.394531 361.667969 429.769531 C 361.667969 416.195312 372.746094 405.121094 386.324219 405.121094 C 399.949219 405.121094 411.03125 416.195312 411.03125 429.769531 C 411.03125 443.394531 399.949219 454.46875 386.324219 454.46875 Z M 498.921875 454.46875 C 485.292969 454.46875 474.265625 443.394531 474.265625 429.769531 C 474.265625 416.195312 485.292969 405.121094 498.921875 405.121094 C 512.550781 405.121094 523.578125 416.195312 523.578125 429.769531 C 523.578125 443.394531 512.550781 454.46875 498.921875 454.46875" />
    </svg>
  );
}
