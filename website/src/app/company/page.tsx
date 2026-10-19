import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Target, Heart, ShieldCheck, Globe2, Mail } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Company - ${siteConfig.name}`,
};

const values = [
  {
    icon: Target,
    title: "Built around real operational needs",
    description: "Every feature ships to solve a workflow problem a real shop, warehouse, or back office actually has — not to demonstrate technical capability.",
  },
  {
    icon: ShieldCheck,
    title: "Data integrity by design",
    description: "Stock counts, sales totals, and financial reports stay consistent with each other by construction, not through manual reconciliation.",
  },
  {
    icon: Globe2,
    title: "Localized for East African markets",
    description: "RWF, KES, UGX, TZS, and USD, in English, Kinyarwanda, or Swahili — built for the region from day one, not translated as an afterthought.",
  },
  {
    icon: Heart,
    title: "Pricing that scales with you",
    description: "A single-location business and a multi-branch operation have different needs — our plans scale with the business, not against it.",
  },
];

export default function CompanyPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow="About Pesaa" title={<>Business Management Software Built for Operational Excellence</>} description={<>{`${siteConfig.name} is headquartered in Kigali, Rwanda.`}</>} image="/marketing/business-owner-banner.webp" imageAlt="Illustrative business owner in a neighbourhood shop" />

      {/* About */}
      <section id="about" className="landing-section px-5 sm:px-8 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-3">About us</p>
          <h2 className="landing-title mb-6">
            Built to Solve a Real Operational Problem
          </h2>
          <div className="space-y-4 text-muted leading-relaxed text-lg">
            <p>
              {`${siteConfig.name} was founded on a clear observation: small and mid-sized businesses across East Africa were operating on a patchwork of spreadsheets, manual records, and disconnected software — separate systems for sales, inventory, and accounting that rarely stayed in sync.`}
            </p>
            <p>
              {`Our team, based in Kigali, built ${siteConfig.name} to be the single platform a business owner relies on daily — for point of sale, inventory, accounting, and workforce management — replacing a stack of five disconnected tools with one.`}
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="landing-section px-5 sm:px-8 bg-surface scroll-mt-20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-3">Our mission</p>
          <h2 className="landing-title mb-6">
            Enterprise-Grade Tools, Accessible to Every Business
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            Implementing reliable business software shouldn&apos;t require an
            IT department. Our mission is to deliver accurate sales,
            inventory, and accounting tools that are simple enough for a
            single owner-operator, and robust enough for a growing,
            multi-branch team.
          </p>
        </div>
      </section>

      {/* Values */}
      <section id="values" className="landing-section px-5 sm:px-8 scroll-mt-20">
        <div className="max-w-[1176px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-3">Our values</p>
            <h2 className="landing-title">Our operating principles</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {values.map((v) => (
              <div key={v.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                  <v.icon size={20} className="text-[var(--primary)]" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{v.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{v.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team / Careers */}
      <section id="careers" className="landing-section px-5 sm:px-8 bg-surface scroll-mt-20">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-3">Our team</p>
          <h2 className="landing-title mb-6">
            A lean team, by design
          </h2>
          <p className="text-lg text-muted leading-relaxed mb-8">
            We operate with a deliberately small team, which means everyone
            who works on {siteConfig.name} engages directly with the
            businesses that use it. We don&apos;t have open positions listed
            at the moment, but we welcome inquiries from people interested in
            joining us.
          </p>
          <a
            href={`mailto:info@pesaa.io?subject=Interested%20in%20joining%20${siteConfig.name}`}
            className="landing-button px-6 py-3 text-sm"
          >
            <Mail size={18} />
            Introduce Yourself
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
