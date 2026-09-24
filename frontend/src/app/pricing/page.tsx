import type { Metadata } from "next";
import Image from "next/image";
import { Check, ArrowRight, HelpCircle } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";
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
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <Image
          src="/verticals/pharmacy.jpg"
          alt="Pharmacist organizing medicine on shelves in a pharmacy"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Plans That Scale With Your Business
          </h1>
          <p className="text-lg text-white/70">
            {`From a single-location owner-operator to a multi-branch enterprise, ${siteConfig.name} scales with your operations. Get started at no cost, and upgrade as your needs grow.`}
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.title}
                className={`p-6 rounded-xl border transition-colors flex flex-col ${
                  plan.featured
                    ? "border-[#16a34a] bg-[#16a34a]/5 shadow-md"
                    : "border-border hover:border-[#16a34a]/40"
                }`}
              >
                {plan.featured && (
                  <div className="bg-[#16a34a] text-white text-xs font-bold px-3 py-1 rounded-md inline-block mb-4 w-fit">
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
                  href={plan.title === "Enterprise" ? "/contact" : "/register"}
                  className={`inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    plan.featured
                      ? "bg-[#16a34a] text-white hover:bg-[#15803d]"
                      : "border border-border text-foreground hover:border-[#16a34a]/40"
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-[#16a34a] uppercase tracking-wide mb-3">
              FAQ
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="bg-card border border-border rounded-xl p-5 flex gap-3.5">
                <HelpCircle size={18} className="text-[#16a34a] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{item.q}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534]">
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Consolidate Your Business Operations Today</h2>
          <p className="text-white/60 mb-8">No credit card required, and you may cancel at any time.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/register"
              className="bg-[#16a34a] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#15803d] transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="mailto:info@pesaa.io"
              className="border border-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/5 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
