import type { Metadata } from "next";
import { LegalLayout } from "@/components/layout/LegalLayout";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Terms of Service - ${siteConfig.name}`,
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="September 10, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and
        use of {siteConfig.name} (&quot;we&quot;,
        &quot;us&quot;). By creating an account or using {siteConfig.name}, you agree
        to these Terms on behalf of yourself and, if applicable, the
        business you represent (&quot;you&quot;, your &quot;tenant&quot;).
      </p>

      <h2>1. Your account</h2>
      <p>
        You must provide accurate information when creating an account and
        keep your login credentials secure. You are responsible for all
        activity that happens under your account and your tenant.
      </p>

      <h2>2. Your data</h2>
      <p>
        You retain ownership of all business data you enter into {siteConfig.name} —
        your customers, sales, inventory, accounting, and employee records.
        We process that data only to provide the service to you, as
        described in our{" "}
        <a href="/privacy">Privacy Policy</a>. You are responsible for the
        accuracy and legality of the data you enter, and for having the
        right to store any customer or employee information you add.
      </p>

      <h2>3. Plans and billing</h2>
      <p>
        {siteConfig.name} offers a free plan and paid plans with additional users,
        modules, and support. If you choose a paid plan, we will confirm
        pricing and billing terms with you before charging. You can change
        or cancel your plan at any time; downgrading may reduce access to
        certain modules or user seats.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use {siteConfig.name} for any unlawful purpose, or to store data you don&apos;t have the right to store.</li>
        <li>Attempt to access another tenant&apos;s data or bypass account or tenant isolation controls.</li>
        <li>Interfere with or disrupt the platform&apos;s infrastructure, or attempt to reverse-engineer it.</li>
        <li>Resell or provide access to {siteConfig.name} to third parties outside your own business without our agreement.</li>
      </ul>

      <h2>5. Availability</h2>
      <p>
        We work to keep {siteConfig.name} available and reliable, but the service is
        provided on an &quot;as is&quot; and &quot;as available&quot; basis.
        We may need to modify, suspend, or update features from time to
        time, and we&apos;ll try to give notice of changes that materially
        affect you.
      </p>

      <h2>6. Suspension and termination</h2>
      <p>
        You may stop using {siteConfig.name} and close your account at any time. We
        may suspend or terminate accounts that violate these Terms, misuse
        the platform, or fail to pay for a paid plan, after reasonable
        notice where practical.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {siteConfig.company} is not
        liable for indirect, incidental, or consequential damages arising
        from your use of {siteConfig.name}. Nothing in these Terms limits liability
        that cannot be limited under applicable law.
      </p>

      <h2>8. Changes to these Terms</h2>
      <p>
        We may update these Terms as the product evolves. We&apos;ll update
        the date at the top of this page when we do, and where changes are
        material, we&apos;ll let tenant owners know directly.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of Rwanda, where{" "}
        {siteConfig.company} is based, without regard to conflict-of-law
        rules.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:info@pesaa.io">info@pesaa.io</a>.
      </p>
    </LegalLayout>
  );
}
