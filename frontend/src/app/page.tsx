import type { Metadata } from "next";
import {
  Check,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeatureShowcaseTabs } from "@/components/marketing/FeatureShowcaseTabs";
import { TrustBadges } from "@/components/marketing/TrustBadges";
import { siteConfig } from "@/lib/config";
import { getPlatformStats } from "@/lib/publicStats";

export const metadata: Metadata = {
  title: `Home - ${siteConfig.name}`,
};

export default async function Home() {
  const stats = await getPlatformStats();
  const highlights = [
    { value: String(stats.businesses), label: `Businesses already using ${siteConfig.name}` },
    { value: String(stats.orders_processed), label: "Orders processed" },
    { value: String(stats.modules), label: "Modules in one platform" },
    { value: String(stats.currencies), label: "Currencies supported" },
  ];
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
            One Platform to Run Your Entire Business
          </h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto mb-8">
            Sales, inventory, accounting, and HR — unified in a single ERP
            platform, replacing the spreadsheets and disconnected tools
            businesses outgrow.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <a
              href="/register"
              className="bg-[#16a34a] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#15803d] transition-colors inline-flex items-center justify-center gap-2"
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
              Real-time sync across web and mobile
            </div>
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              Onboard in under 30 minutes
            </div>
          </div>
        </div>
      </section>

      {/* 2. Product Showcase — one section, animated tabs */}
      <section id="showcase" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#16a34a] uppercase tracking-wide mb-3">
              Platform overview
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              A Unified Platform for Every Business Function
            </h2>
          </div>
          <FeatureShowcaseTabs />
        </div>
      </section>

      {/* 3. Who It's For — real photos of real business types */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#16a34a] uppercase tracking-wide mb-3">
              Industries we serve
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Purpose-Built for Every Business Vertical
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              {`From retail to service industries, ${siteConfig.name} adapts to your operations and workflows — not the other way around.`}
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
            <p className="text-sm font-semibold text-foreground mb-4">Also serving</p>
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

      {/* 4. Highlights — quick numbers */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#052e16]">
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

      {/* 5. Certified & Trusted */}
      <TrustBadges />

      {/* 6. Final CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534] overflow-hidden">
        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Consolidate Your Business Operations Today
          </h2>
          <p className="text-xl text-white/60 mb-6">
            Get started at no cost and manage sales, inventory, accounting,
            and HR from a single, unified platform.
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
              className="bg-[#16a34a] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#15803d] transition-colors inline-flex items-center justify-center gap-2"
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
    description: "Point-of-sale checkout, real-time inventory tracking, and supplier order management in one system.",
    image: "/verticals/grocery.jpg",
    alt: "Shelves inside a small grocery shop stocked with everyday products",
  },
  {
    title: "Pharmacies",
    description: "Monitor stock levels, manage reorder points, and maintain efficient checkout operations.",
    image: "/verticals/pharmacy.jpg",
    alt: "Pharmacist organizing medicine on shelves in a pharmacy",
  },
  {
    title: "Electronics & Phone Shops",
    description: "Manage product variants, serial numbers, and a high-turnover catalog with precision.",
    image: "/verticals/electronics.jpg",
    alt: "Close-up of electronics on display in a shop",
  },
  {
    title: "Repairs & Service Shops",
    description: "End-to-end job tracking from intake to delivery, with full device history and status visibility.",
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


