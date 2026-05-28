import Link from "next/link";

import { Prose } from "@/components/policy/prose";

/**
 * Terms &amp; conditions prose, ported from the legacy
 * storefront's `app/components/legal/TermsConditionsContent.tsx`.
 *
 * Material updates vs legacy:
 *
 *   - Contact email swapped from `info@salespace.com` to
 *     `hello@zepr.com` and contact CTAs route through the v2{" "}
 *     `<a href="/contact">contact form</a>`.
 *   - Returns links to the v2 returns flow under `/account/orders`
 *     and shipping references the v2 customer support paths
 *     (return requests live in the account dashboard).
 *   - Removed the legacy decorative chrome (coloured boxes,
 *     emoji section markers). Single typography dialect via
 *     `<Prose>`.
 *
 * Substantive legal language (warranty disclaimers, limitation
 * of liability, governing law, indemnification, severability)
 * is carried over verbatim — those clauses are reviewed legal
 * boilerplate and any rewording risks changing legal meaning.
 */
export function TermsConditionsContent() {
  return (
    <Prose>
      <p>
        <strong>Salespace Platforms, Inc.</strong>, a Delaware corporation
        operating from Miami, Florida, USA, operates Zepr (Zepr.com), the
        storefront and website that is the subject of these Terms &amp;
        Conditions, to provide you with a curated shopping experience. Our
        Services are powered by Shopify, but all sales and purchases are
        made directly with Salespace Platforms, Inc. Checkout and payment
        processing are handled by Shopify. Contact:{" "}
        <a href="mailto:hello@zepr.com">hello@zepr.com</a>.
      </p>
      <p>
        Welcome to Zepr. These terms and conditions outline the rules and
        regulations for the use of our website and Services.
      </p>
      <p>
        By accessing this website, we assume you accept these terms and
        conditions. Do not continue to use our website if you do not agree
        to all of the terms and conditions stated on this page.
      </p>
      <p>
        <strong>Important legal agreement.</strong>         These Terms of Service,
        together with our{" "}
        <Link href="/policies/privacy-policy">privacy policy</Link>,
        constitute the entire agreement between you and Salespace Platforms, Inc.
        regarding your use of our Services. Please read carefully — they
        include important information about warranty disclaimers and
        limitations of liability.
      </p>
      <p>
        <strong>Age &amp; account requirements.</strong>
      </p>
      <ul>
        <li>You must be at least 18 years old to make purchases.</li>
        <li>If under 18, you may browse with parental consent.</li>
        <li>You must provide accurate account and payment information.</li>
        <li>
          You are responsible for maintaining the confidentiality of your
          account.
        </li>
        <li>
          Accounts cannot be transferred, sold, or assigned to others.
        </li>
      </ul>

      <h2 id="shopping-orders">Shopping &amp; orders</h2>
      <h3>Product information disclaimer</h3>
      <ul>
        <li>
          Product descriptions, images, specifications, and other details
          are provided for informational purposes only.
        </li>
        <li>
          We make reasonable efforts to ensure product information is
          accurate, but do not warrant that such information is error-free,
          complete, reliable, or current.
        </li>
        <li>
          Colors, packaging, materials, and specifications may vary slightly
          from what is displayed.
        </li>
        <li>
          Actual colors may vary due to monitor settings, lighting, and
          manufacturing variations.
        </li>
        <li>Product availability is subject to change without notice.</li>
        <li>We reserve the right to limit quantities on any product.</li>
      </ul>
      <h3>Supplier responsibility</h3>
      <ul>
        <li>
          Certain product details originate from manufacturers and
          suppliers.
        </li>
        <li>
          While we rely on these sources in good faith, we cannot
          independently verify all information.
        </li>
        <li>
          Product specifications, compatibility, and features are subject
          to manufacturer changes.
        </li>
        <li>
          If you receive a product that is materially different from its
          description, your sole remedy is to return it in accordance with
          our Return Policy.
        </li>
      </ul>
      <h3>Pricing &amp; payment</h3>
      <ul>
        <li>
          All prices are displayed in the currency selected for your region.
        </li>
        <li>Prices are subject to change without prior notice.</li>
        <li>
          Payment is processed securely through our payment partners.
        </li>
        <li>
          We accept major credit cards and other payment methods as
          displayed at checkout.
        </li>
      </ul>
      <h3>Order processing &amp; fulfillment</h3>
      <ul>
        <li>
          <strong>Processing time:</strong> Orders are typically fulfilled
          within 1&ndash;3 business days, but may take longer during peak
          periods.
        </li>
        <li>
          You will receive an email confirmation when your order is placed
          and shipped (with tracking information).
        </li>
        <li>
          We reserve the right to cancel orders in cases such as pricing
          errors, suspected fraud, product unavailability, or other
          circumstances beyond our control.
        </li>
        <li>
          Bulk orders may require additional processing time and approval.
        </li>
        <li>
          If we cancel your order, you will receive a full refund within
          5&ndash;10 business days.
        </li>
      </ul>

      <h2 id="shipping-delivery">Shipping &amp; delivery</h2>
      <ul>
        <li>
          <strong>Delivery times:</strong> Average shipping is 7&ndash;14
          days, but may take longer depending on location and circumstances
          beyond our control.
        </li>
        <li>Shipping costs vary by location and method selected.</li>
        <li>
          We are not liable for shipping delays caused by carriers, weather,
          customs, or other factors outside our control.
        </li>
        <li>
          All delivery times are estimates only and are not guaranteed.
        </li>
        <li>
          Risk of loss passes to you upon confirmed delivery to your
          address, except where local consumer laws provide otherwise.
        </li>
        <li>
          Please inspect packages upon delivery and report damage or
          missing items within 48 hours through our{" "}
          <Link href="/contact">contact form</Link>.
        </li>
        <li>
          Customers are responsible for providing accurate shipping
          addresses.
        </li>
      </ul>
      <h3>Taxes &amp; import duties</h3>
      <p>
        International customers are responsible for all applicable customs
        duties, taxes, and import fees. These charges are determined by
        your local customs authority and are not included in our product
        prices or shipping costs.
      </p>

      <h2 id="returns-refunds">Returns &amp; refunds</h2>
      <ul>
        <li>
          <strong>Return window:</strong> Return requests must be initiated
          within 7 days of receiving your order.
        </li>
        <li>
          Submit a return request through your{" "}
          <Link href="/account/orders">orders page</Link> in your account
          dashboard, or contact us through our{" "}
          <Link href="/contact">contact form</Link> to request a return
          authorization.
        </li>
        <li>
          <strong>Inspection required:</strong> All returns are subject to
          inspection and approval upon receipt.
        </li>
        <li>
          Items must be in original condition with tags attached and
          original packaging.
        </li>
        <li>
          Custom, personalized, or hygiene-sensitive items cannot be
          returned.
        </li>
        <li>
          <strong>Return shipping:</strong> The customer is responsible for
          return shipping costs unless the item is defective or we sent the
          wrong item.
        </li>
        <li>
          <strong>No free returns:</strong> We do not offer free returns
          for non-defective items or items that match their description.
        </li>
        <li>
          Refunds are processed within 5&ndash;10 business days after we
          receive and approve the return.
        </li>
      </ul>
      <p>
        <strong>Consumer rights.</strong> Nothing in this policy affects
        your statutory rights under applicable consumer protection laws,
        including mandatory cooling-off periods where required by law.
      </p>

      <h2 id="accounts">User accounts &amp; access</h2>
      <h3>Account requirements</h3>
      <ul>
        <li>
          By agreeing to these Terms, you represent that you are at least
          the age of majority in your state or province of residence.
        </li>
        <li>
          You have given us your consent to allow any of your minor
          dependents to use the Services on devices you own, purchase or
          manage.
        </li>
        <li>
          You must provide accurate, current and complete information when
          creating an account.
        </li>
        <li>
          You represent and warrant that you have all rights necessary to
          provide this information.
        </li>
        <li>
          You are solely responsible for maintaining the security of your
          account credentials and for all activity on your account.
        </li>
        <li>
          You may not transfer, sell, assign, or license your account to
          any other person.
        </li>
      </ul>
      <h3>Payment information requirements</h3>
      <ul>
        <li>
          You agree to provide current, complete and accurate purchase,
          payment and account information for all purchases.
        </li>
        <li>
          You agree to promptly update your account information, including
          email address and payment details, so we can complete
          transactions and contact you as needed.
        </li>
        <li>
          You represent and warrant that: (i) the payment information you
          provide is true, correct, and complete, (ii) you are authorized
          to use such payment method, (iii) charges will be honored by your
          payment provider, and (iv) you will pay all charges at posted
          prices, including shipping and applicable taxes.
        </li>
      </ul>

      <h2 id="privacy">Privacy &amp; data protection</h2>
      <p>
        Your privacy is important to us. Please review our{" "}
        <Link href="/policies/privacy-policy">privacy policy</Link> to
        understand how we collect, use, and protect your information.
      </p>
      <ul>
        <li>
          We collect only the information necessary to provide our Services.
        </li>
        <li>
          Your data is protected with industry-standard security measures.
        </li>
        <li>We do not sell your personal information to third parties.</li>
        <li>
          You have control over your data and can submit a request through
          our <Link href="/policies/opt-out">privacy choices page</Link> at
          any time.
        </li>
      </ul>

      <h2 id="ip">Intellectual property &amp; user content</h2>
      <h3>Our intellectual property</h3>
      <ul>
        <li>
          All website content, design, and functionality are protected by
          copyright and trademark laws.
        </li>
        <li>
          You may not reproduce, distribute, or create derivative works
          without written permission.
        </li>
        <li>
          Product images and descriptions may be provided by suppliers or
          manufacturers, and are used under license or fair use.
        </li>
        <li>
          Salespace Platforms, Inc. and Zepr names, logos, and designs are
          our trademarks.
        </li>
        <li>
          Shopify&rsquo;s name, logo, and services are trademarks of
          Shopify.
        </li>
        <li>
          All other brand names and logos are trademarks of their
          respective owners.
        </li>
      </ul>
      <h3>User-generated content &amp; feedback</h3>
      <p>
        When you submit reviews, feedback, suggestions, or other content to
        us, you grant us certain rights:
      </p>
      <ul>
        <li>
          <strong>License grant:</strong> You give us a perpetual,
          worldwide, royalty-free license to use, reproduce, modify, and
          display your content.
        </li>
        <li>
          <strong>Commercial use:</strong> We may use your feedback to
          improve our Services, marketing, and operations.
        </li>
        <li>
          <strong>Your warranties:</strong> You confirm you own the rights
          to your content and that it does not violate any laws or
          third-party rights.
        </li>
        <li>
          <strong>No compensation:</strong> We&rsquo;re not obligated to pay
          for or respond to your feedback.
        </li>
        <li>
          <strong>Content moderation:</strong> We may edit or remove
          content that violates our policies.
        </li>
      </ul>

      <h2 id="prohibited">Prohibited uses</h2>
      <p>You may not use our website for:</p>
      <ul>
        <li>
          Any unlawful purpose or to solicit others to perform unlawful
          acts.
        </li>
        <li>
          Violating any international, federal, provincial, or state
          regulations, rules, laws, or local ordinances.
        </li>
        <li>
          Infringing upon or violating our intellectual property rights or
          the intellectual property rights of others.
        </li>
        <li>
          Harassing, abusing, insulting, harming, defaming, slandering,
          disparaging, intimidating, or discriminating.
        </li>
        <li>Submitting false or misleading information.</li>
        <li>
          Uploading or transmitting viruses or any other type of malicious
          code.
        </li>
      </ul>

      <h2 id="safety">Safety &amp; usage disclaimer</h2>
      <p>
        Some products sold through our store may carry inherent risks if
        used improperly.
      </p>
      <h3>Cosmetics &amp; personal care products</h3>
      <ul>
        <li>
          Always perform a patch test on a small area of skin before
          applying more broadly.
        </li>
        <li>
          Discontinue use immediately if irritation, redness, or allergic
          reaction occurs.
        </li>
        <li>Check ingredient lists for known allergens before use.</li>
        <li>Follow expiration dates and storage instructions.</li>
        <li>Keep out of reach of children.</li>
      </ul>
      <h3>Electronics &amp; battery-powered devices</h3>
      <ul>
        <li>
          Do not leave devices plugged in for extended periods when fully
          charged.
        </li>
        <li>Do not expose to extreme heat, cold, or moisture.</li>
        <li>
          Follow airline regulations when traveling with lithium
          battery-powered products.
        </li>
        <li>
          Use only manufacturer-approved chargers and accessories.
        </li>
        <li>
          Discontinue use if a device becomes hot, swollen, or damaged.
        </li>
        <li>Dispose of batteries according to local regulations.</li>
      </ul>
      <h3>Home &amp; garden products</h3>
      <ul>
        <li>
          Read and follow all manufacturer instructions and safety
          guidelines.
        </li>
        <li>
          Use appropriate protective equipment when recommended.
        </li>
        <li>
          Keep chemicals and small parts away from children and pets.
        </li>
        <li>
          Ensure proper ventilation when using aerosols or chemicals.
        </li>
        <li>
          Check weight limits and installation requirements for furniture
          and fixtures.
        </li>
      </ul>
      <h3>General safety guidelines</h3>
      <ul>
        <li>
          Always follow the manufacturer&rsquo;s instructions and safety
          guidelines.
        </li>
        <li>
          Inspect products upon receipt for damage or defects.
        </li>
        <li>Use products only for their intended purpose.</li>
        <li>
          Seek professional advice for installation or use when in doubt.
        </li>
        <li>
          Report safety concerns or defects to us immediately through our{" "}
          <Link href="/contact">contact form</Link>.
        </li>
      </ul>
      <p>
        <strong>Legal notice.</strong> By purchasing and using our products,
        you agree to use them responsibly and at your own risk, subject to
        applicable consumer protection laws. Misuse may result in injury or
        damage for which we cannot be held liable. This safety disclaimer
        applies to all current and future product categories we may offer.
        Additional category-specific warnings may be added as our product
        range expands.
      </p>

      <h2 id="third-party-links">Third-party links &amp; optional tools</h2>
      <h3>External links &amp; websites</h3>
      <ul>
        <li>
          Our website may contain links to third-party websites and
          services.
        </li>
        <li>
          We are not responsible for the content, accuracy, or practices of
          external sites.
        </li>
        <li>You access third-party sites at your own risk.</li>
        <li>
          Review third-party policies before engaging in transactions.
        </li>
        <li>
          Direct complaints about third-party products or services to those
          providers.
        </li>
      </ul>
      <h3>Optional tools &amp; features</h3>
      <ul>
        <li>
          We may provide access to third-party tools and features
          (analytics, payments, etc.).
        </li>
        <li>
          These tools are provided &ldquo;as is&rdquo; without warranties
          or endorsement.
        </li>
        <li>
          You use optional tools entirely at your own risk and discretion.
        </li>
        <li>
          We have no control over or liability for third-party tools.
        </li>
        <li>
          New features and tools are subject to these Terms.
        </li>
      </ul>
      <h3>Relationship with Shopify</h3>
      <p>
        While our store is powered by Shopify, all sales and purchases are
        made directly with Salespace Platforms, Inc.
      </p>
      <ul>
        <li>
          Shopify provides the e-commerce platform and technology.
        </li>
        <li>
          Shopify is not responsible for any aspect of sales between you
          and Salespace Platforms, Inc.
        </li>
        <li>
          Shopify is not liable for any injury, damage, or loss from
          purchased products.
        </li>
        <li>
          All customer service, returns, and disputes are handled by
          Salespace Platforms, Inc.
        </li>
        <li>
          You release Shopify from claims related to your purchases from
          us.
        </li>
      </ul>

      <h2 id="feedback">Feedback &amp; user content</h2>
      <p>
        If you submit, upload, post, email, or otherwise transmit any
        ideas, suggestions, feedback, reviews, proposals, plans, or other
        content (collectively, &ldquo;Feedback&rdquo;), you grant us a
        perpetual, worldwide, sublicensable, royalty-free license to use,
        reproduce, modify, publish, distribute and display such Feedback
        in any medium for any purpose, including for commercial use.
      </p>
      <ul>
        <li>
          We may use your feedback to operate, provide, evaluate, enhance,
          improve and promote our Services.
        </li>
        <li>
          You represent that you own or have all necessary rights to your
          Feedback.
        </li>
        <li>
          You must disclose any compensation received in connection with
          your Feedback submission.
        </li>
        <li>Your Feedback must comply with these Terms.</li>
        <li>
          We have no obligation to maintain confidentiality, pay
          compensation, or respond to your Feedback.
        </li>
      </ul>
      <h3>Content standards</h3>
      <p>
        We may monitor, edit or remove Feedback that we determine to be
        unlawful, offensive, threatening, libelous, defamatory,
        pornographic, obscene or otherwise objectionable.
      </p>
      <ul>
        <li>
          Your Feedback must not violate any third-party rights (copyright,
          trademark, privacy, etc.).
        </li>
        <li>
          Content must not be libelous, unlawful, abusive, or obscene.
        </li>
        <li>
          Do not include computer viruses or malware that could affect our
          Services.
        </li>
        <li>Do not use false information or impersonate others.</li>
        <li>
          You are solely responsible for your Feedback and its accuracy.
        </li>
      </ul>

      <h2 id="errors">Errors, inaccuracies and omissions</h2>
      <p>
        Occasionally there may be information on our Services that contains
        typographical errors, inaccuracies or omissions that may relate to
        product descriptions, pricing, promotions, offers, shipping
        charges, transit times and availability.
      </p>
      <ul>
        <li>
          We reserve the right to correct any errors, inaccuracies or
          omissions at any time without prior notice.
        </li>
        <li>
          We may change or update information or cancel orders if any
          information is inaccurate.
        </li>
        <li>
          This includes corrections made after you have submitted your
          order.
        </li>
        <li>
          We undertake no obligation to update, amend or clarify
          information unless required by law.
        </li>
      </ul>

      <h2 id="disclaimers">Disclaimers &amp; limitations</h2>
      <ul>
        <li>
          <strong>&ldquo;As is&rdquo; Services:</strong> Our website and
          Services are provided &ldquo;as is&rdquo; without warranties of
          any kind.
        </li>
        <li>
          <strong>No guarantees:</strong> We do not guarantee that our
          website will be error-free, uninterrupted, or secure.
        </li>
        <li>
          <strong>Limited liability:</strong> We are not liable for
          indirect, incidental, or consequential damages.
        </li>
        <li>
          <strong>Damage cap:</strong> Our liability is limited to the
          amount you paid for the product or service.
        </li>
        <li>
          <strong>Consumer rights:</strong> Some jurisdictions do not allow
          limitations on warranties, so some limitations may not apply to
          you.
        </li>
      </ul>

      <h2 id="governing-law">Governing law &amp; disputes</h2>
      <p>
        These terms and conditions are governed by and construed in
        accordance with the laws of the State of Delaware, USA, without
        regard to its conflict of law principles.
      </p>
      <p>
        Any disputes, claims, or controversies arising from or relating to
        these terms or your use of our website shall be subject to the
        exclusive jurisdiction of the state and federal courts located in
        Delaware, USA. This does not affect your statutory rights as a
        consumer under applicable local laws.
      </p>

      <h2 id="force-majeure">Force majeure</h2>
      <p>
        We shall not be liable for any failure or delay in performance
        under these terms due to circumstances beyond our reasonable
        control, including but not limited to:
      </p>
      <ul>
        <li>
          Acts of God, natural disasters, pandemics, or extreme weather.
        </li>
        <li>
          Government actions, regulations, or travel restrictions.
        </li>
        <li>
          Labor strikes, supplier delays, or transportation disruptions.
        </li>
        <li>
          Internet outages, cyber attacks, or technical failures.
        </li>
        <li>War, terrorism, or other acts of violence.</li>
      </ul>
      <p>
        In such cases, we will make reasonable efforts to notify affected
        customers and resume normal operations as soon as possible.
      </p>

      <h2 id="boilerplate">Legal boilerplate</h2>
      <h3>Indemnification</h3>
      <p>
        You agree to defend, indemnify, and hold harmless Salespace
        Platforms, Inc., Shopify, and our affiliates from any claims,
        damages, or expenses arising from:
      </p>
      <ul>
        <li>Your breach of these terms or violation of any law.</li>
        <li>Your use of our Services or products purchased.</li>
        <li>Your violation of any third-party rights.</li>
        <li>
          Any content you submit or actions you take on our site.
        </li>
      </ul>
      <h3>Severability &amp; waiver</h3>
      <ul>
        <li>
          <strong>Severability:</strong> If any part of these terms is
          found invalid, the rest remains in effect.
        </li>
        <li>
          <strong>Waiver:</strong> Our failure to enforce any right does
          not waive that right for the future.
        </li>
        <li>
          <strong>Entire agreement:</strong> These terms and our{" "}
          <Link href="/policies/privacy-policy">privacy policy</Link>{" "}
          constitute the complete agreement between us.
        </li>
        <li>
          <strong>Assignment:</strong> You cannot transfer these terms; we
          may assign them without notice.
        </li>
      </ul>
      <h3>Account termination</h3>
      <ul>
        <li>
          We may suspend or terminate your account at any time for
          violating these terms.
        </li>
        <li>
          You remain liable for all amounts due up to termination.
        </li>
        <li>
          Certain sections survive termination (intellectual property
          rights, liability limitations, etc.).
        </li>
        <li>
          You may close your account at any time from your account
          settings.
        </li>
      </ul>

      <h2 id="changes">Changes to terms</h2>
      <p>
        We reserve the right to update these terms and conditions at any
        time. Changes will be posted on this page with an updated revision
        date. Your continued use of our website after any changes
        constitutes acceptance of the new terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        If you have any questions about these Terms &amp; Conditions, get
        in touch through our <Link href="/contact">contact form</Link> or
        email us at <a href="mailto:hello@zepr.com">hello@zepr.com</a>.
      </p>
      <p>
        <strong>Accessibility.</strong> If you require these terms in an
        alternative format due to accessibility needs, please contact us at{" "}
        <a href="mailto:hello@zepr.com">hello@zepr.com</a>.
      </p>
    </Prose>
  );
}
