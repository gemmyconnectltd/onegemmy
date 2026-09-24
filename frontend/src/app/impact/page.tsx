import type { Metadata } from "next";
import Image from "next/image";
import { Languages, Coins, ShieldCheck, Smartphone, Building2, LayoutGrid } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";
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
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <Image
          src="/verticals/repairs.jpg"
          alt="Technician repairing an electronic device on a workbench"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Small and Mid-Sized Businesses Drive the East African Economy
          </h1>
          <p className="text-lg text-white/70">
            {`${siteConfig.name} is an early-stage company — we don't report figures or partnerships we haven't earned yet. Here's what we're prepared to commit to today.`}
          </p>
        </div>
      </section>

      {/* By the numbers — real product facts, not fabricated business claims */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#052e16]">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-semibold text-[#4ade80] uppercase tracking-wide mb-12">
            By the numbers
          </p>
          <div className={`grid ${NUMBERS_GRID_COLS[numbers.length] ?? "grid-cols-2 md:grid-cols-4"} gap-8 text-center`}>
            {numbers.map((item) => (
              <div key={item.label}>
                <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon size={20} className="text-[#4ade80]" />
                </div>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {item.value}
                </div>
                <div className="text-white/50 text-sm">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrustBadges />

      {/* Pillars */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {pillars.map((p) => (
              <div key={p.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#16a34a]/10 flex items-center justify-center flex-shrink-0">
                  <p.icon size={20} className="text-[#16a34a]" />
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
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface">
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

      {/* CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534]">
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Become One of Our Early Customer Stories</h2>
          <p className="text-white/60 mb-8">Get started at no cost, and if the platform delivers for your business, we&apos;d be glad to feature your story here.</p>
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-[#16a34a] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#15803d] transition-colors"
          >
            Start Free Trial
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
