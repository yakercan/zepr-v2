import type { Metadata } from "next";

import { TermsConditionsContent } from "@/components/policy/contents/terms-conditions";
import { PolicyPage } from "@/components/policy/policy-page";
import { findPolicy } from "@/lib/policies/manifest";

/**
 * `/policies/terms-conditions` — site-wide terms of service.
 */

const entry = findPolicy("terms-conditions");

export const metadata: Metadata = {
  title: entry?.title ?? "Terms & conditions",
  description: entry?.summary,
};

export default function TermsConditionsPage() {
  return (
    <PolicyPage handle="terms-conditions">
      <TermsConditionsContent />
    </PolicyPage>
  );
}
