import type { Metadata } from "next";
import { LegalLayout } from "@/components/layout/LegalLayout";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy - OneGemmy",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="September 10, 2026">
      <p>
        This Privacy Policy explains how {siteConfig.company} (&quot;OneGemmy&quot;,
        &quot;we&quot;, &quot;us&quot;) collects, uses, and protects information when
        you use our website and our business management platform at{" "}
        <a href={siteConfig.url}>{siteConfig.url}</a>.
      </p>

      <h2>Who this applies to</h2>
      <p>
        OneGemmy is a multi-tenant platform: a business (&quot;tenant&quot;) signs up
        for an account and uses OneGemmy to manage its own sales, inventory,
        accounting, HR, and customer data. This means we handle two kinds of
        information differently:
      </p>
      <ul>
        <li>
          <strong>Account information</strong> that you, as a tenant owner or
          team member, give us directly — for example when you register,
          invite teammates, or contact support. We control this information
          as set out in this policy.
        </li>
        <li>
          <strong>Business data</strong> that a tenant enters into the
          platform — for example a tenant&apos;s customer records, sales,
          inventory, or employee data. We process this data on behalf of the
          tenant, under their instructions, to provide the service. If you
          are a customer or employee of a business using OneGemmy, your data
          there is controlled by that business, not by us — please contact
          them directly about it.
        </li>
      </ul>

      <h2>Information we collect</h2>
      <ul>
        <li>Account details: name, email address, phone number, business name.</li>
        <li>
          Business operational data you or your team enter into the
          platform: customers, sales, inventory, expenses, employees, and
          similar records.
        </li>
        <li>
          Usage data: log-in activity, device and browser information, and
          how you interact with the app, used to keep the service secure and
          to improve it.
        </li>
        <li>
          Communications: information you send us when you contact support
          or sales.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To provide, maintain, and secure the OneGemmy platform.</li>
        <li>To authenticate you and keep each tenant&apos;s data isolated from every other tenant.</li>
        <li>To respond to support requests and communicate service updates.</li>
        <li>To monitor for abuse, fraud, and technical issues.</li>
        <li>To improve the product based on aggregated, non-identifying usage patterns.</li>
      </ul>
      <p>We do not sell your personal information or a tenant&apos;s business data.</p>

      <h2>Data isolation between tenants</h2>
      <p>
        Every tenant&apos;s business data is scoped to that tenant and is not
        accessible to other tenants. Our engineering practices treat
        cross-tenant data access as a bug to be prevented, not a feature.
      </p>

      <h2>Data retention</h2>
      <p>
        We retain account and business data for as long as your account is
        active. If you close your account, we delete or anonymize your data
        within a reasonable period, except where we are required to keep it
        for legal, tax, or security reasons.
      </p>

      <h2>Your choices</h2>
      <p>
        You can access, correct, export, or request deletion of your account
        information at any time from within the app, or by emailing us at{" "}
        <a href="mailto:info@gemmyconnect.com">info@gemmyconnect.com</a>. If
        you are a customer or employee of a business using OneGemmy and want
        your data corrected or removed, please contact that business
        directly, as they control that data.
      </p>

      <h2>International use</h2>
      <p>
        OneGemmy is built by a Rwanda-based company and used by businesses
        across East Africa and beyond. By using OneGemmy you understand your
        information may be processed in a country other than your own.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as the product evolves. If we make material
        changes, we&apos;ll update the date at the top of this page and, where
        appropriate, notify tenant owners directly.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy or your data can be sent to{" "}
        <a href="mailto:info@gemmyconnect.com">info@gemmyconnect.com</a>.
      </p>
    </LegalLayout>
  );
}
