import type { Metadata } from "next";

import { CookiePolicyContent } from "@/components/policy/contents/cookie-policy";
import { PolicyPage } from "@/components/policy/policy-page";
import { findPolicy } from "@/lib/policies/manifest";

/**
 * `/policies/cookie-policy` — cookie usage disclosure.
 */

const entry = findPolicy("cookie-policy");

export const metadata: Metadata = {
  title: entry?.title ?? "Cookie policy",
  description: entry?.summary,
};

export default function CookiePolicyPage() {
  return (
    <PolicyPage handle="cookie-policy">
      <CookiePolicyContent />
    </PolicyPage>
  );
}
