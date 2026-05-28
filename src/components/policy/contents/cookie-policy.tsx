import Link from "next/link";

import { Prose } from "@/components/policy/prose";

/**
 * Cookie policy prose, ported from the legacy storefront's
 * `app/components/legal/CookiePolicyContent.tsx`.
 *
 * Material updates vs legacy:
 *
 *   - Removed processors that aren&rsquo;t part of v2: Algolia
 *     (search analytics) and Tawk.to (live chat) — neither is
 *     wired into the v2 stack. SendGrid swapped for Resend
 *     (our transactional email provider). HCaptcha dropped —
 *     not currently used.
 *   - Contact email swapped from `info@salespace.com` to
 *     `hello@zepr.com`.
 *   - Removed the legacy decorative chrome (coloured boxes,
 *     emoji section markers). Single typography dialect via
 *     `<Prose>`.
 *   - The legacy doc claimed v2 has a cookie consent banner;
 *     we don&rsquo;t ship one yet, so language around &ldquo;our
 *     cookie banner&rdquo; is replaced with directing readers to
 *     browser settings + our privacy choices page.
 */
export function CookiePolicyContent() {
  return (
    <Prose>
      <p>
        <strong>Salespace Platforms, Inc.</strong>, a Delaware corporation
        operating from Miami, Florida, USA, operates Zepr (Zepr.com) and is
        responsible for cookie usage on this website. We comply with
        applicable U.S. data protection laws, including the California
        Consumer Privacy Act (CCPA/CPRA) for California residents. Shopify
        provides our e-commerce platform and processes some personal data on
        our behalf as a service provider.
      </p>
      <p>
        This Cookie Policy explains how we use cookies and similar
        technologies to provide a working storefront, enhance your shopping
        experience, and measure how our website is used.
      </p>
      <p>
        <strong>Legal basis.</strong> We use essential cookies under our
        legitimate interest to provide a secure and functioning website. All
        other cookies (analytics, personalization, marketing) are used only
        with your consent where consent is required by applicable law.
      </p>

      <h2 id="what-are-cookies">What are cookies?</h2>
      <p>
        Cookies are small text files that are stored on your device when you
        visit our website. They help us remember your preferences, keep you
        signed in, keep your cart intact between visits, and provide you
        with a personalized shopping experience.
      </p>
      <p>
        <strong>Children&rsquo;s protection.</strong> We do not knowingly
        use cookies to collect data from children under 13. Our Services
        are designed for adults aged 18 or older for purchases, though
        minors may browse with parental supervision.
      </p>

      <h2 id="types">Types of cookies we use</h2>
      <h3>Essential cookies (always active)</h3>
      <p>
        These cookies are necessary for our website to function properly.
        They cannot be disabled.
      </p>
      <ul>
        <li>
          <strong>Session management:</strong> Keeps you signed in and
          remembers the items in your cart between page loads.
        </li>
        <li>
          <strong>Security:</strong> Protects against fraud and ensures
          secure checkout and authentication.
        </li>
        <li>
          <strong>Preferences:</strong> Remembers your locale, currency, and
          basic site settings.
        </li>
        <li>
          <strong>Load balancing:</strong> Ensures optimal website
          performance and reliability.
        </li>
      </ul>
      <h3>Analytics &amp; performance cookies</h3>
      <p>
        These help us understand how the storefront is used so we can
        improve it.
      </p>
      <ul>
        <li>
          <strong>Shopify Analytics:</strong> Aggregated e-commerce insights
          on visits, traffic sources, and conversions.
        </li>
        <li>
          <strong>Search analytics:</strong> Measures the queries shoppers
          run and the results they interact with, so we can improve search
          relevance and product discovery.
        </li>
        <li>
          <strong>Performance monitoring:</strong> Helps us identify and fix
          technical issues such as broken pages or slow responses.
        </li>
      </ul>
      <h3>Personalization cookies</h3>
      <p>
        These enhance your shopping experience with personalized features
        and recommendations.
      </p>
      <ul>
        <li>
          <strong>Favorites:</strong> Saves your favorited items across
          visits.
        </li>
        <li>
          <strong>Recently viewed:</strong> Shows products you&rsquo;ve
          looked at recently.
        </li>
        <li>
          <strong>Search preferences:</strong> Remembers your filters and
          recent searches.
        </li>
        <li>
          <strong>Recommendations:</strong> Suggests products related to
          items you&rsquo;ve viewed or purchased.
        </li>
      </ul>

      <h2 id="third-party">Third-party cookies</h2>
      <p>
        Some cookies are set by third-party services we rely on to operate
        the storefront and enhance your experience:
      </p>
      <ul>
        <li>
          <strong>Shopify:</strong> Powers our checkout, payments, customer
          accounts, and core analytics. Shopify is independently responsible
          for some of the personal data it collects — see the{" "}
          <a
            href="https://www.shopify.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Shopify Consumer Privacy Policy
          </a>{" "}
          for details.
        </li>
        <li>
          <strong>Resend:</strong> Delivers transactional emails (order
          confirmations, customer support replies, privacy request
          notifications). Resend does not set cookies on the storefront
          itself but receives the email address you provide so we can send
          you the email.
        </li>
        <li>
          <strong>Hosting and content delivery:</strong> Cookies and similar
          identifiers used by our hosting and CDN providers for load
          balancing, security, and DDoS protection.
        </li>
        <li>
          <strong>Embedded media:</strong> If we embed videos or images
          hosted by a third party (for example, social media or a
          third-party media platform), those providers may set their own
          cookies. We have no control over those cookies — review the
          relevant third party&rsquo;s privacy policy.
        </li>
      </ul>

      <h2 id="your-choices">Your cookie choices</h2>
      <p>
        You have full control over cookies in a few different places:
      </p>
      <ul>
        <li>
          <strong>Your browser settings.</strong> Every modern browser lets
          you block all cookies, block third-party cookies only, delete
          existing cookies, or set per-site preferences for future visits.
          Blocking essential cookies will break parts of the storefront
          (sign-in, cart, checkout).
        </li>
        <li>
          <strong>Privacy choices page.</strong> Submit a request through
          our{" "}
          <Link href="/policies/opt-out">privacy choices page</Link> to opt
          out of the sale or sharing of personal information, unsubscribe
          from marketing, or exercise other rights described in our{" "}
          <Link href="/policies/privacy-policy">privacy policy</Link>.
        </li>
      </ul>
      <h3>California residents (CCPA / CPRA)</h3>
      <p>
        If you are located in California, you also have the right to opt
        out of cookies that may be considered a &ldquo;sale&rdquo; or
        &ldquo;sharing&rdquo; of personal information under the CCPA/CPRA:
      </p>
      <ul>
        <li>Right to opt out of cross-context behavioral advertising.</li>
        <li>Right to know what personal information is being shared.</li>
        <li>Right to non-discrimination for exercising these rights.</li>
        <li>
          Submit a &ldquo;Do Not Sell or Share My Personal Information&rdquo;{" "}
          request through our{" "}
          <Link href="/policies/opt-out">privacy choices page</Link>.
        </li>
      </ul>

      <h2 id="manage">How to manage cookies in your browser</h2>
      <ul>
        <li>
          <strong>Chrome:</strong> Settings &rarr; Privacy and security
          &rarr; Cookies and other site data.
        </li>
        <li>
          <strong>Firefox:</strong> Settings &rarr; Privacy &amp; Security
          &rarr; Cookies and Site Data.
        </li>
        <li>
          <strong>Safari:</strong> Settings &rarr; Privacy &rarr; Manage
          Website Data.
        </li>
        <li>
          <strong>Edge:</strong> Settings &rarr; Cookies and site
          permissions &rarr; Cookies and site data.
        </li>
      </ul>

      <h2 id="retention">Cookie retention</h2>
      <p>How long do cookies last?</p>
      <ul>
        <li>
          <strong>Session cookies:</strong> Deleted when you close your
          browser.
        </li>
        <li>
          <strong>Persistent cookies:</strong> Remain until their expiration
          date or you delete them manually.
        </li>
        <li>
          <strong>Most cookies:</strong> Expire within 1&ndash;2 years.
        </li>
        <li>
          <strong>Essential cookies:</strong> May last longer for security
          and functionality.
        </li>
        <li>
          <strong>Shopify session:</strong> Until your browser closes or you
          sign out.
        </li>
        <li>
          <strong>Search and analytics cookies:</strong> Typically up to 6
          months.
        </li>
        <li>
          <strong>Consent choice:</strong> Until you change it.
        </li>
      </ul>
      <p>
        The specific retention period for each cookie may vary depending on
        the provider and cookie type. You can always clear cookies manually
        through your browser settings.
      </p>

      <h2 id="updates">Updates to this policy</h2>
      <p>
        We may update this Cookie Policy from time to time to reflect
        changes in our practices or legal requirements. When we make
        significant changes, we&rsquo;ll bump the &ldquo;Last updated&rdquo;
        date at the top of this page and, where required by law, request
        your consent again before applying any new cookie categories or
        materially changing how we use your data.
      </p>

      <h2 id="contact">Questions about cookies?</h2>
      <p>
        We&rsquo;re committed to transparency about our use of cookies. If
        you have any questions or concerns, please reach out through our{" "}
        <Link href="/contact">contact form</Link> or email us at{" "}
        <a href="mailto:hello@zepr.com">hello@zepr.com</a>.
      </p>
      <p>
        <strong>Accessibility.</strong> If you require this policy in an
        alternative format due to accessibility needs, please contact us at{" "}
        <a href="mailto:hello@zepr.com">hello@zepr.com</a>.
      </p>
    </Prose>
  );
}
