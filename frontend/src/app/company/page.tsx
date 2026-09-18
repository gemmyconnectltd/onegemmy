import type { Metadata } from "next";
import { Target, Heart, ShieldCheck, Globe2, Mail } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Company - ${siteConfig.name}`,
};

const values = [
  {
    icon: Target,
    title: "Built for how you actually work",
    description: "No feature ships because it's technically impressive — it ships because a real shop, warehouse, or back office needed it.",
  },
  {
    icon: ShieldCheck,
    title: "Your numbers are always right",
    description: "Stock counts, sales totals, and financial reports stay consistent with each other by construction, not by manual reconciliation.",
  },
  {
    icon: Globe2,
    title: "Local by default",
    description: "RWF, KES, UGX, TZS, and USD, in English, Kinyarwanda, or Swahili — built for East Africa from day one, not translated as an afterthought.",
  },
  {
    icon: Heart,
    title: "Priced for small businesses",
    description: "A one-person shop and a multi-branch operation shouldn't pay the same way — plans scale with the business, not against it.",
  },
];

export default function CompanyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#e8a488] uppercase tracking-wide mb-3">Company</p>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            We build the back office so you don&apos;t have to run one
          </h1>
          <p className="text-lg text-white/60">
            {`${siteConfig.name} is based in Kigali, Rwanda.`}
          </p>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">About us</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            A small team building the tool we couldn&apos;t find
          </h2>
          <div className="space-y-4 text-muted leading-relaxed text-lg">
            <p>
              {`${siteConfig.name} started from a simple observation: small and mid-sized businesses in East Africa were running on a patchwork of spreadsheets, notebooks, and disconnected apps — one for sales, another for stock, another for the books that never quite agreed with each other.`}
            </p>
            <p>
              {`We're a small team based in Kigali, and we build ${siteConfig.name} to be the one place a business owner opens every morning — for the register, the warehouse, the accounts, and the team — instead of five.`}
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="py-24 px-4 sm:px-6 lg:px-8 bg-surface scroll-mt-20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">Our mission</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Give every small business the tools bigger companies take for granted
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            Running a business shouldn&apos;t require an IT department to set
            up software correctly. Our mission is to make accurate sales,
            inventory, and accounting tools simple enough for a single shop
            owner to run alone, and solid enough for a growing team to run
            together.
          </p>
        </div>
      </section>

      {/* Values */}
      <section id="values" className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">Our values</p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">How we build {siteConfig.name}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {values.map((v) => (
              <div key={v.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#6f1a07]/10 flex items-center justify-center flex-shrink-0">
                  <v.icon size={20} className="text-[#6f1a07]" />
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
      <section id="careers" className="py-24 px-4 sm:px-6 lg:px-8 bg-surface scroll-mt-20">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">Our team</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Small on purpose, for now
          </h2>
          <p className="text-lg text-muted leading-relaxed mb-8">
            We&apos;re a small team, which means every person who touches
            {" " + siteConfig.name} talks to the businesses using it. We don&apos;t have
            open roles listed right now, but we&apos;re always glad to hear
            from people who want to build with us.
          </p>
          <a
            href={`mailto:info@pesaa.io?subject=Interested%20in%20joining%20${siteConfig.name}`}
            className="inline-flex items-center gap-2 bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors"
          >
            <Mail size={18} />
            Introduce Yourself
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
