import type { Metadata } from "next";
import {
  Check,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeatureShowcaseTabs } from "@/components/marketing/FeatureShowcaseTabs";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Home - ${siteConfig.name}`,
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* 1. Hero — real shop photo, not a mockup */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <Image
          src="/verticals/grocery.jpg"
          alt="Inside a real small shop, shelves stocked with everyday products"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Run your whole business from one place
          </h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto mb-8">
            Sales, stock, books, and your team, in one place — with the
            spreadsheets and side-notebooks finally put away for good.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <a
              href="/register"
              className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="#showcase"
              className="border border-white/30 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Explore the Product
            </a>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-white/70 text-sm">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              Web + mobile, always in sync
            </div>
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              Setup in 30 minutes
            </div>
          </div>
        </div>
      </section>

      {/* 2. Product Showcase — one section, animated tabs */}
      <section id="showcase" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              Explore the product
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              One tool, every part of the business
            </h2>
          </div>
          <FeatureShowcaseTabs />
        </div>
      </section>

      {/* 3. Who It's For — real photos of real business types */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              Who it&apos;s for
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Every Kind of Business
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              {`From supermarkets to repair shops, ${siteConfig.name} adapts to how you actually sell — not the other way around.`}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {businessTypes.map((v) => (
              <div
                key={v.title}
                className="group relative rounded-xl overflow-hidden aspect-[4/5]"
              >
                <Image
                  src={v.image}
                  alt={v.alt}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h3 className="text-white font-bold text-lg leading-tight mb-1">{v.title}</h3>
                  <p className="text-white/70 text-sm leading-snug">{v.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm font-semibold text-foreground mb-4">Also great for</p>
            <div className="flex flex-wrap justify-center gap-2">
              {retailTags.map((t) => (
                <span
                  key={t}
                  className="text-sm bg-card border border-border text-foreground/70 px-3.5 py-1.5 rounded-full"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              Plans
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Every Business Size
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              {`Whether you're a solo shop owner or running multiple branches, ${siteConfig.name} scales with you.`}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.title}
                className={`p-6 rounded-xl border transition-colors ${
                  plan.featured
                    ? "border-[#6f1a07] bg-[#6f1a07]/5 shadow-md"
                    : "border-border hover:border-[#6f1a07]/40"
                }`}
              >
                {plan.featured && (
                  <div className="bg-[#6f1a07] text-white text-xs font-bold px-3 py-1 rounded-md inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {plan.title}
                </h3>
                <p className="text-muted text-sm mb-4">{plan.subtitle}</p>
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-foreground/70 text-sm"
                    >
                      <Check size={16} className="text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Highlights — quick numbers */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1209]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {highlights.map((item) => (
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

      {/* 6. Final CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22] overflow-hidden">
        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Stop Juggling Tools. Start Today.
          </h2>
          <p className="text-xl text-white/60 mb-6">
            Start free, set up in minutes, and manage everything — sales,
            stock, books, and your team — from one place.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-white/60 text-sm mb-10">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              Cancel anytime
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/register"
              className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Your Free Trial
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

const businessTypes = [
  {
    title: "Supermarkets & Grocery Shops",
    description: "Fast checkout, stock across every shelf, and supplier orders in one place.",
    image: "/verticals/grocery.jpg",
    alt: "Shelves inside a small grocery shop stocked with everyday products",
  },
  {
    title: "Pharmacies",
    description: "Track stock closely, watch what's running low, and keep the counter moving.",
    image: "/verticals/pharmacy.jpg",
    alt: "Pharmacist organizing medicine on shelves in a pharmacy",
  },
  {
    title: "Electronics & Phone Shops",
    description: "Handle variants, serials, and a fast-moving catalog without losing track.",
    image: "/verticals/electronics.jpg",
    alt: "Close-up of electronics on display in a shop",
  },
  {
    title: "Repairs & Service Shops",
    description: "Job intake to delivery, with device details and status at every step.",
    image: "/verticals/repairs.jpg",
    alt: "Technician repairing an electronic device on a workbench",
  },
];

const retailTags = [
  "Supermarkets", "Grocery Shops", "Electronics Stores", "Clothing & Fashion Boutiques",
  "Shoe Stores", "Hardware Stores", "Pharmacies", "Bookstores & Stationery",
  "Furniture Stores", "Cosmetics & Beauty Shops", "Mobile Phone & Accessories Shops",
  "Barber Shops & Salons", "Auto Repair Garages", "Bakeries", "Liquor Stores",
];

const plans = [
  {
    title: "Free",
    subtitle: "Trial essentials for small businesses",
    featured: false,
    features: ["Basic dashboard", "Up to 2 users", "Core modules", "No credit card required"],
  },
  {
    title: "Starter",
    subtitle: "Growing teams with core modules",
    featured: false,
    features: ["All Free features", "Up to 10 users", "Inventory & sales"],
  },
  {
    title: "Professional",
    subtitle: "Full modules for scaling operations",
    featured: true,
    features: ["All Starter features", "Unlimited users", "HR & accounting"],
  },
  {
    title: "Enterprise",
    subtitle: "Unlimited everything, priority support",
    featured: false,
    features: ["All Professional features", "Custom integrations", "Priority support"],
  },
];

const highlights = [
  { value: "7", label: "Modules in one platform" },
  { value: "6+", label: "Currencies supported" },
  { value: "3", label: "Languages, including Kinyarwanda" },
  { value: "30 min", label: "Average setup time" },
];

