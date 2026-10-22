import { CallToAction } from "@/components/marketing/CallToAction";
import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";
import { PlanComparison } from "@/components/marketing/PlanComparison";
import { PricingPlans } from "@/components/marketing/PricingPlans";

export const metadata: Metadata = {
  title: `Pricing - ${siteConfig.name}`,
};

const faqs = [
  {
    q: "Is a credit card required to get started?",
    a: "No. You can register and explore without a card — choose a plan when your business is ready.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, at any time. Moving between plans does not affect your data — sales, inventory, and accounting records carry over as-is.",
  },
  {
    q: "Is there an implementation or setup fee?",
    a: "No setup fees on any plan. Your account is operational within minutes of registration.",
  },
  {
    q: "Which currencies are supported?",
    a: `${siteConfig.name} supports RWF, KES, UGX, TZS, and USD natively — pricing and reporting run in whichever currency your business operates in.`,
  },
  {
    q: "How is Enterprise pricing determined?",
    a: "Enterprise pricing is quote-based, scoped to branch count, integration requirements, and support needs — contact our team for a tailored proposal.",
  },
];

export default function PricingPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow="Plans & pricing" title={<>Plans That Scale With Your Business</>} description={<>{`From a single-location owner-operator to a multi-branch enterprise, ${siteConfig.name} scales with your operations. Pick the plan that fits today and upgrade as your needs grow.`}</>} />

      {/* Plans */}
      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-[1176px] mx-auto">
          <PricingPlans />
          <p className="text-center text-sm text-muted mt-10">
            {`Not sure which plan fits? Contact us and we'll help you choose. Annual billing saves 20%.`}
          </p>
        </div>
      </section>

      {/* Feature comparison */}
      <section className="landing-section px-5 sm:px-8 bg-surface">
        <div className="max-w-[1176px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="landing-title">Compare every feature</h2>
            <p className="mt-3 text-sm text-muted">See exactly what is included in each plan.</p>
          </div>
          <PlanComparison />
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-3">
              FAQ
            </p>
            <h2 className="landing-title">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="landing-card p-5 flex gap-3.5">
                <HelpCircle size={18} className="text-[var(--primary)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{item.q}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CallToAction title={<>Consolidate Your Business Operations Today</>} description={<>No credit card required, and you may cancel at any time.</>} />

      </main>
      <Footer />
    </div>
  );
}
