import { CallToAction } from "@/components/marketing/CallToAction";
import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Languages, Coins, ShieldCheck, Smartphone, Building2, LayoutGrid } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";
import { getPlatformStats, MIN_BUSINESSES_TO_SHOW } from "@/lib/publicStats";
import { TrustBadges } from "@/components/marketing/TrustBadges";

export const metadata: Metadata = {
  title: `Impact - ${siteConfig.name}`,
};

// Static per possible count, so Tailwind's build-time scanner can see every
// class literally (a dynamically-interpolated `grid-cols-${n}` gets purged).
const NUMBERS_GRID_COLS: Record<number, string> = {
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

const pillars = [
  {
    icon: Coins,
    title: "Accessible pricing for every business size",
    description:
      "Plans are priced so a single-location owner can access real point-of-sale and inventory tools — not only businesses that can already afford a dedicated accountant.",
  },
  {
    icon: Languages,
    title: "Localized for the languages businesses actually operate in",
    description: "English, Kinyarwanda, and Swahili, with RWF, KES, UGX, TZS, and USD supported natively — not translated as an afterthought.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first, for the device your team already carries",
    description: "A dedicated mobile app handles checkout, inventory, and daily sales, synced with the web dashboard in real time — no additional hardware required.",
  },
  {
    icon: ShieldCheck,
    title: "Your data remains your own",
    description: "Every business's data is isolated to its own account, with export available at any time — no vendor lock-in.",
  },
];

export default async function ImpactPage() {
  const stats = await getPlatformStats();
  const numbers = [
    ...(stats.businesses >= MIN_BUSINESSES_TO_SHOW
      ? [{ icon: Building2, value: String(stats.businesses), label: `Businesses already using ${siteConfig.name}` }]
      : []),
    { icon: LayoutGrid, value: String(stats.modules), label: "Modules in one platform" },
    { icon: Coins, value: String(stats.currencies), label: "Currencies supported" },
    { icon: ShieldCheck, value: "100%", label: "Of every business's data kept isolated to their own account" },
  ];
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow="Built for growing businesses" title={<>Small and Mid-Sized Businesses Drive the East African Economy</>} description={<>{`${siteConfig.name} is an early-stage company — we don't report figures or partnerships we haven't earned yet. Here's what we're prepared to commit to today.`}</>} image="/marketing/wholesale-owner.webp" imageAlt="Illustrative wholesale merchant managing his business" />

      {/* By the numbers — real product facts, not fabricated business claims */}
      <section className="landing-section px-5 sm:px-8 border-y border-emerald-100 bg-[var(--primary-light)]">
        <div className="max-w-[1176px] mx-auto">
          <p className="text-center text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-12">
            By the numbers
          </p>
          <div className={`grid ${NUMBERS_GRID_COLS[numbers.length] ?? "grid-cols-2 md:grid-cols-4"} gap-8 text-center`}>
            {numbers.map((item) => (
              <div key={item.label}>
                <div className="w-11 h-11 rounded-xl bg-emerald-100/70 flex items-center justify-center mx-auto mb-3">
                  <item.icon size={20} className="text-[var(--primary)]" />
                </div>
                <div className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-2">
                  {item.value}
                </div>
                <div className="text-slate-500 text-sm">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrustBadges compact />

      {/* Pillars */}
      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-[1176px] mx-auto">
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {pillars.map((p) => (
              <div key={p.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                  <p.icon size={20} className="text-[var(--primary)]" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{p.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honest framing */}
      <section className="landing-section px-5 sm:px-8 bg-surface">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
            Where we stand today
          </h2>
          <p className="text-muted leading-relaxed mb-4">
            We are a small, early-stage company. We do not yet have the
            formal partnerships, certifications, or track record we&apos;d
            want to quantify — and we&apos;d rather state that directly than
            include claims we can&apos;t substantiate.
          </p>
          <p className="text-muted leading-relaxed">
            What we can demonstrate is the product itself, and the
            businesses running on it. As that track record grows, this page
            will reflect it.
          </p>
        </div>
      </section>

      <CallToAction title={<>Become One of Our Early Customer Stories</>} description={<>Get started at no cost, and if the platform delivers for your business, we&apos;d be glad to feature your story here.</>} />

      </main>
      <Footer />
    </div>
  );
}
