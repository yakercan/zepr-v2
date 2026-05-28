import type { Metadata } from "next";

import { PrivacyPolicyContent } from "@/components/policy/contents/privacy-policy";
import { PolicyPage } from "@/components/policy/policy-page";
import { findPolicy } from "@/lib/policies/manifest";

/**
 * `/policies/privacy-policy` — public privacy policy.
 *
 * Metadata is sourced from the policy manifest so the
 * "Last updated" stamp on the page and the `<title>` /
 * description in search results never drift out of sync.
 */

const entry = findPolicy("privacy-policy");

export const metadata: Metadata = {
  title: entry?.title ?? "Privacy policy",
  description: entry?.summary,
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage handle="privacy-policy">
      <PrivacyPolicyContent />
    </PolicyPage>
  );
}
