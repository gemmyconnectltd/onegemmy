import { CallToAction } from "@/components/marketing/CallToAction";
import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Check, ArrowRight, HelpCircle } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { appUrl, siteConfig } from "@/lib/site";
import { plans } from "@/lib/plans";

export const metadata: Metadata = {
  title: `Pricing - ${siteConfig.name}`,
};

const faqs = [
  {
    q: "Is a credit card required to get started?",
    a: "No. The Free plan requires no card and can be used indefinitely — upgrade only when your business requires additional users or modules.",
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

      <PageHero eyebrow="Plans & pricing" title={<>Plans That Scale With Your Business</>} description={<>{`From a single-location owner-operator to a multi-branch enterprise, ${siteConfig.name} scales with your operations. Get started at no cost, and upgrade as your needs grow.`}</>} />

      {/* Plans */}
      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-[1176px] mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.title}
                className={`landing-card relative p-6 transition-colors flex flex-col ${
                  plan.featured
                    ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-md"
                    : "border-border hover:border-[var(--primary)]/40"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-6 bg-[var(--primary)] text-white text-[10px] font-bold px-3 py-1 rounded-full w-fit">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-foreground mb-2">{plan.title}</h3>
                <p className="text-muted text-sm mb-5">{plan.subtitle}</p>
                <ul className="space-y-3 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-foreground/70 text-sm">
                      <Check size={16} className="text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.title === "Enterprise" ? "/contact" : appUrl("/register")}
                  className={`inline-flex items-center justify-center gap-1.5 w-full px-4 py-3 rounded-lg font-semibold text-sm transition-colors ${
                    plan.featured
                      ? "landing-button"
                      : "landing-secondary"
                  }`}
                >
                  {plan.title === "Enterprise" ? "Talk to Sales" : "Start Free Trial"}
                  <ArrowRight size={14} />
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted mt-10">
            {`Final pricing depends on your business size and requirements — every account starts on the Free plan with no credit card required. Contact us and we'll help you select the right plan.`}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section px-5 sm:px-8 bg-surface">
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
