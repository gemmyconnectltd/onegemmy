import type { Metadata } from "next";
import { Languages, Coins, ShieldCheck, Smartphone } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Impact - ${siteConfig.name}`,
};

const numbers = [
  { value: "7", label: "Modules in one platform" },
  { value: "6+", label: "Currencies supported" },
  { value: "3", label: "Languages, including Kinyarwanda" },
  { value: "100%", label: "Of every business's data kept isolated to their own account" },
];

const pillars = [
  {
    icon: Coins,
    title: "Affordable for a one-person shop, not just a chain",
    description:
      "Plans are priced so a solo shop owner can afford real sales and stock tools, not just businesses that can already afford an accountant.",
  },
  {
    icon: Languages,
    title: "Built in the languages people actually run their business in",
    description: "English, Kinyarwanda, and Swahili, with RWF, KES, UGX, TZS, and USD supported natively — not translated as an afterthought.",
  },
  {
    icon: Smartphone,
    title: "Works on the phone your staff already carries",
    description: "A dedicated mobile app handles checkout, stock, and daily sales, in sync with the web dashboard in real time — no extra device to buy.",
  },
  {
    icon: ShieldCheck,
    title: "Your data belongs to you",
    description: "Every business's data is isolated to their own account, and export is always available — you're never locked in.",
  },
];

export default function ImpactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#4ade80] uppercase tracking-wide mb-3">Our approach</p>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Small businesses run the East African economy. Our software should treat them that way
          </h1>
          <p className="text-lg text-white/60">
            {`${siteConfig.name} is early — we're not going to claim numbers or partnerships we don't have yet. Here's what we actually commit to today.`}
          </p>
        </div>
      </section>

      {/* By the numbers — real product facts, not fabricated business claims */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#052e16]">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-semibold text-[#4ade80] uppercase tracking-wide mb-12">
            By the numbers
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {numbers.map((item) => (
              <div key={item.label}>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {item.value}
                </div>
                <div className="text-white/50 text-sm">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            Where we are right now
          </h2>
          <p className="text-muted leading-relaxed mb-4">
            We&apos;re a small, early-stage team. We don&apos;t yet have
            formal partnerships, certifications, or a track record we&apos;d
            want to put a number on — and we&apos;d rather say that plainly
            than pad this page with claims we can&apos;t back up.
          </p>
          <p className="text-muted leading-relaxed">
            What we can point to is the product itself, and the businesses
            using it. As that grows, this page will grow with it.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534]">
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Be one of our first stories</h2>
          <p className="text-white/60 mb-8">Start free, and if it works for you, we&apos;d love to tell your story here one day.</p>
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
