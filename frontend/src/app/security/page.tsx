import type { Metadata } from "next";
import { ShieldCheck, KeyRound, Building2, Lock, Mail } from "lucide-react";
import { LegalLayout } from "@/components/layout/LegalLayout";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Security - ${siteConfig.name}`,
};

const practices = [
  {
    icon: KeyRound,
    title: "Password security",
    description:
      "Passwords are never stored in plain text. They're hashed with bcrypt before being saved, so even we can't read them.",
  },
  {
    icon: ShieldCheck,
    title: "Token-based authentication",
    description:
      "Access to your account is controlled with short-lived authentication tokens, so a leaked token doesn't grant indefinite access.",
  },
  {
    icon: Building2,
    title: "Tenant data isolation",
    description:
      "Every business's data is scoped to that business at the data layer. Our engineering rules treat any cross-tenant data access as a bug to be prevented, not a feature.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit",
    description:
      `${siteConfig.name} is served over HTTPS, so data moving between your browser and our servers is encrypted.`,
  },
];

export default function SecurityPage() {
  return (
    <LegalLayout title="Security" lastUpdated="September 10, 2026">
      <p>
        We know you&apos;re trusting {siteConfig.name} with real business data — sales,
        customers, inventory, and finances. Here&apos;s a plain look at how
        we protect it.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 my-8">
        {practices.map((p) => (
          <div key={p.title} className="bg-card border border-border rounded-xl p-5">
            <div className="w-10 h-10 rounded-lg bg-[#16a34a]/10 flex items-center justify-center mb-3">
              <p.icon size={20} className="text-[#16a34a]" />
            </div>
            <h3 className="font-bold text-foreground mb-1.5">{p.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{p.description}</p>
          </div>
        ))}
      </div>

      <h2>Infrastructure</h2>
      <p>
        {siteConfig.name} runs on managed cloud infrastructure rather than
        self-hosted servers, so the underlying hardware, network, and
        database are operated by established infrastructure providers.
      </p>

      <h2>Our approach</h2>
      <p>
        We&apos;re a growing team building {siteConfig.name} for businesses across
        East Africa, and security is something we invest in continuously
        rather than treat as a one-time checklist. If you have specific
        security or compliance requirements for your business, reach out —
        we&apos;re happy to talk through what we support today and what&apos;s
        on our roadmap.
      </p>

      <h2>Report a concern</h2>
      <p className="flex items-start gap-2">
        <Mail size={18} className="text-[#16a34a] mt-0.5 flex-shrink-0" />
        <span>
          If you believe you&apos;ve found a security issue, please email us
          at{" "}
          <a href="mailto:info@pesaa.io">info@pesaa.io</a>{" "}
          with details. We take reports seriously and will follow up
          directly.
        </span>
      </p>
    </LegalLayout>
  );
}
