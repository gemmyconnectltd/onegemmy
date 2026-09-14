import type { Metadata } from "next";
import { LegalLayout } from "@/components/layout/LegalLayout";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "OneGemmy Privacy Policy | Gemmy Connect Ltd",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="September 14, 2026">
      <p>
        {siteConfig.company}{" "}
        (&quot;Gemmy Connect&quot;, &quot;OneGemmy&quot;, &quot;we&quot;,
        &quot;us&quot;, or &quot;our&quot;) respects your privacy and is
        committed to protecting personal data.
      </p>
      <p>
        This Privacy Policy explains how we collect, use, store, share, and
        protect personal information when you access or use OneGemmy, our
        business management platform, including our website, web
        application, mobile applications, and related services.
      </p>
      <p>By using OneGemmy, you acknowledge the practices described in this Privacy Policy.</p>

      <h2>1. About OneGemmy</h2>
      <p>
        OneGemmy is a business management platform provided by{" "}
        <strong>{siteConfig.company}</strong>, a company based in Rwanda.
      </p>
      <p>
        Businesses can use OneGemmy to manage activities such as sales,
        customers, inventory, expenses, accounting records, employees,
        reporting, and other business information.
      </p>
      <p>
        Because OneGemmy is a multi-tenant platform, each business operates
        within its own account and workspace.
      </p>

      <h2>2. Our role when processing data</h2>
      <p>The role Gemmy Connect plays depends on the type of information involved.</p>
      <p>
        For information you provide directly to us when creating an account,
        communicating with us, or using our services, Gemmy Connect
        determines how that information is processed.
      </p>
      <p>
        When a business uses OneGemmy to store information about its
        customers, employees, suppliers, transactions, or other business
        activities, we generally process that information on behalf of that
        business and according to its instructions.
      </p>
      <p>
        If your personal information has been entered into OneGemmy by a
        business that you interact with, you should normally contact that
        business first if you wish to access, correct, or delete that
        information.
      </p>

      <h2>3. Information we collect</h2>
      <p>Depending on how you use OneGemmy, we may collect:</p>
      <ul>
        <li>
          <strong>Account and profile information</strong>, including your
          name, email address, phone number, business name, role, and
          account credentials.
        </li>
        <li>
          <strong>Business information</strong>, including customer records,
          products, inventory, sales, invoices, expenses, suppliers,
          employees, accounting information, and other information entered
          into the platform.
        </li>
        <li>
          <strong>Technical and usage information</strong>, such as IP
          address, device type, browser type, operating system, login
          activity, timestamps, application activity, and diagnostic
          information.
        </li>
        <li>
          <strong>Communications</strong>, including information you provide
          when contacting our support, sales, or other teams.
        </li>
        <li>
          <strong>Payment and subscription information</strong>, where
          applicable, including information required to manage
          subscriptions, billing, and payment status. Payment information
          may also be processed by third-party payment providers.
        </li>
      </ul>
      <p>
        We only seek to collect information reasonably necessary to provide,
        secure, support, and improve our services.
      </p>

      <h2>4. How we use information</h2>
      <p>We may use information to:</p>
      <ul>
        <li>provide and operate OneGemmy;</li>
        <li>create and manage user and business accounts;</li>
        <li>authenticate users and protect accounts;</li>
        <li>process subscriptions and service-related transactions;</li>
        <li>provide customer support;</li>
        <li>maintain separation between business accounts;</li>
        <li>detect fraud, misuse, unauthorized access, and security threats;</li>
        <li>monitor reliability and improve platform performance;</li>
        <li>develop and improve OneGemmy features;</li>
        <li>communicate important service, security, and account updates;</li>
        <li>comply with applicable legal and regulatory obligations; and</li>
        <li>
          protect the rights, property, and security of Gemmy Connect, our
          customers, and users.
        </li>
      </ul>
      <p>
        Where we use aggregated or anonymized information for analytics or
        product improvement, we aim to ensure that the information does not
        directly identify an individual.
      </p>
      <p>
        <strong>We do not sell personal information or customer business data.</strong>
      </p>

      <h2>5. Business customer data</h2>
      <p>
        Businesses using OneGemmy remain responsible for the personal
        information they collect and enter into the platform.
      </p>
      <p>
        A business using OneGemmy should ensure that it has an appropriate
        legal basis or authorization to collect and process information
        about its customers, employees, suppliers, and other individuals.
      </p>
      <p>
        Gemmy Connect processes such information as necessary to provide the
        OneGemmy service and according to the applicable agreement with the
        business.
      </p>
      <p>We do not use one business&apos;s confidential business data for the benefit of another business.</p>

      <h2>6. Data separation and security</h2>
      <p>
        OneGemmy is designed to keep each business&apos;s data logically
        separated from the data of other businesses using the platform.
      </p>
      <p>
        We use reasonable administrative, technical, and organizational
        safeguards designed to protect information against unauthorized
        access, loss, misuse, alteration, or disclosure.
      </p>
      <p>
        These measures may include access controls, authentication,
        encryption where appropriate, monitoring, backups, and security
        practices within our infrastructure.
      </p>
      <p>However, no online service or method of electronic storage can guarantee absolute security.</p>
      <p>
        Users are also responsible for maintaining the confidentiality of
        their account credentials and for notifying us if they suspect
        unauthorized access to their account.
      </p>

      <h2>7. When we share information</h2>
      <p>
        We may share information with trusted service providers that help us
        operate OneGemmy, such as providers of cloud infrastructure,
        communications, analytics, security, customer support, and payment
        services.
      </p>
      <p>
        These providers should only receive information reasonably necessary
        to perform services on our behalf and are expected to handle it
        appropriately.
      </p>
      <p>We may also disclose information where required to:</p>
      <ul>
        <li>comply with applicable law, regulation, court order, or lawful government request;</li>
        <li>investigate fraud, security incidents, or misuse;</li>
        <li>enforce our agreements or protect our legal rights;</li>
        <li>protect users or the public from harm; or</li>
        <li>
          support a merger, acquisition, restructuring, financing, or
          transfer of all or part of our business, subject to appropriate
          safeguards.
        </li>
      </ul>
      <p>We do not sell customer databases to advertisers or data brokers.</p>

      <h2>8. Data retention</h2>
      <p>
        We retain personal and business information for as long as
        reasonably necessary to provide OneGemmy and fulfill the purposes
        described in this Privacy Policy.
      </p>
      <p>
        When an account is closed or data is no longer required, we may
        delete or anonymize it within a reasonable period, subject to backup
        cycles and any legal, regulatory, tax, accounting, fraud-prevention,
        or security requirements that require us to retain certain
        information for longer.
      </p>

      <h2>9. Your rights and choices</h2>
      <p>
        Depending on applicable law and the circumstances, you may have
        rights relating to your personal information, including the ability
        to request access, correction, deletion, or other appropriate action
        concerning your information.
      </p>
      <p>Account holders may be able to manage certain information directly through OneGemmy.</p>
      <p>
        You may also contact us at{" "}
        <a href="mailto:info@gemmyconnect.com">info@gemmyconnect.com</a>.
      </p>
      <p>
        If your information was collected and entered into OneGemmy by a
        business using our platform, please contact that business first.
        Because that business controls its records, we may need to refer
        your request to it.
      </p>
      <p>We may need to verify your identity before processing certain requests.</p>

      <h2>10. Cookies and similar technologies</h2>
      <p>
        Our websites and applications may use cookies or similar
        technologies where necessary to maintain sessions, remember
        preferences, improve functionality, understand service usage, and
        protect accounts.
      </p>
      <p>Where required by applicable law, we will provide appropriate choices regarding non-essential cookies.</p>

      <h2>11. International data processing</h2>
      <p>
        Gemmy Connect is based in Rwanda, while some of the technology and
        service providers supporting OneGemmy may operate infrastructure in
        other countries.
      </p>
      <p>As a result, information may be processed or stored outside the country in which it was originally collected.</p>
      <p>
        Where required, we take reasonable steps to ensure that appropriate
        protections are applied when personal information is transferred
        internationally.
      </p>

      <h2>12. Children&apos;s privacy</h2>
      <p>
        OneGemmy is designed primarily for businesses and their authorized
        users and is not intended for children to create independent
        business accounts.
      </p>
      <p>
        If we become aware that personal information relating to a child has
        been collected in circumstances where appropriate authorization was
        required but not obtained, we will take appropriate steps in
        accordance with applicable law.
      </p>

      <h2>13. Third-party services</h2>
      <p>OneGemmy may integrate with or contain links to third-party services.</p>
      <p>
        Those services may have their own privacy policies and data-handling
        practices. This Privacy Policy does not govern how independent third
        parties process information outside OneGemmy.
      </p>
      <p>We encourage users to review the privacy policies of relevant third-party services.</p>

      <h2>14. Changes to this Privacy Policy</h2>
      <p>
        We may update this Privacy Policy as OneGemmy evolves or as legal,
        regulatory, security, or operational requirements change.
      </p>
      <p>
        When we make changes, we will update the &quot;Last updated&quot;
        date at the top of this page.
      </p>
      <p>
        If changes materially affect how we process personal information, we
        may provide additional notice through OneGemmy, by email, or through
        another appropriate communication channel.
      </p>

      <h2>15. Contact us</h2>
      <p>
        If you have questions, concerns, or requests regarding this Privacy
        Policy or how OneGemmy handles personal information, please contact:
      </p>
      <p>
        <strong>{siteConfig.company}</strong>
        <br />
        Kigali, Rwanda
        <br />
        Email: <a href="mailto:info@gemmyconnect.com">info@gemmyconnect.com</a>
        <br />
        Website: <a href={siteConfig.url}>{siteConfig.url}</a>
      </p>
    </LegalLayout>
  );
}
