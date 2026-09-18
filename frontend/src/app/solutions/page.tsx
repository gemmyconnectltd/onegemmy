import type { Metadata } from "next";
import { Store, Package, Calculator, Handshake, Users, Factory, ShoppingBag, Check } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AppScreenshot } from "@/components/ui/AppScreenshot";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Products - ${siteConfig.name}`,
};

const modules: {
  id: string;
  icon: typeof Store;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  screenshot: string;
  screenshotAlt: string;
  path: string;
}[] = [
  {
    id: "pos",
    icon: Store,
    eyebrow: "Point of Sale",
    title: "A checkout built for the counter",
    description:
      "Search or scan a product, ring it up, and take cash, mobile money, or card — fast enough for a real line at the register, on any browser you already have. Every sale updates stock and the books at the same time, automatically.",
    points: ["No special terminal hardware needed", "Cash, Mobile Money, and Card", "Hold a sale and come back to it later", "Works on the same account as the web dashboard"],
    screenshot: "/screenshots/pos-terminal.png",
    screenshotAlt: `${siteConfig.name} point of sale screen with products in the cart, totals, and a payment method selector`,
    path: "pos",
  },
  {
    id: "inventory",
    icon: Package,
    eyebrow: "Inventory",
    title: "Know exactly what's in stock, everywhere",
    description:
      "Track stock across every warehouse in real time, with low-stock alerts and purchase orders that keep you ahead of demand instead of reacting to it. Every receipt, sale, and return moves the same number.",
    points: ["Multi-warehouse tracking", "Low-stock alerts", "Purchase orders, transfers & returns", "Batch, serial, and variant support"],
    screenshot: "/screenshots/inventory-electronics.png",
    screenshotAlt: `${siteConfig.name} inventory overview for an electronics shop, showing stock health and top products by value`,
    path: "inventory",
  },
  {
    id: "accounting",
    icon: Calculator,
    eyebrow: "Accounting",
    title: "Your books, always up to date",
    description:
      "Invoicing, expenses, and financial reports stay in sync with every sale and purchase automatically — no manual reconciliation, no surprises at month end.",
    points: ["Automated invoicing", "Expense tracking", "Real-time profit & loss", "Chart of accounts & journal entries"],
    screenshot: "/screenshots/accounting.png",
    screenshotAlt: `${siteConfig.name} accounting overview showing income vs expenses and recent activity`,
    path: "accounting",
  },
  {
    id: "sales",
    icon: Handshake,
    eyebrow: "Sales & CRM",
    title: "Close deals faster, never lose track of a lead",
    description:
      "A visual pipeline from first contact to closed deal, with quotes, commissions, and targets built in — so your whole sales team works from one source of truth.",
    points: ["Drag-and-drop pipeline", "Quotes & commissions", "Team targets & performance", "Customer history in one place"],
    screenshot: "/screenshots/sales-pipeline.png",
    screenshotAlt: `${siteConfig.name} CRM pipeline showing leads, qualified deals, and closed-won value by stage`,
    path: "crm",
  },
  {
    id: "hr",
    icon: Users,
    eyebrow: "HR & Payroll",
    title: "Your team, without a separate HR tool",
    description:
      "Attendance, leave, and payroll for your team, tracked alongside the rest of the business instead of in a tool nobody logs into.",
    points: ["Employee directory", "Attendance & leave", "Payroll", "Performance reviews"],
    screenshot: "/screenshots/dashboard.png",
    screenshotAlt: `${siteConfig.name} dashboard`,
    path: "hr",
  },
  {
    id: "procurement",
    icon: ShoppingBag,
    eyebrow: "Procurement",
    title: "Suppliers, purchase orders, and bills in one flow",
    description:
      "Raise a purchase order, receive the goods, and the bill it creates is tracked through to payment — so you always know what you owe and to whom.",
    points: ["Supplier directory", "Purchase orders & requisitions", "Goods receiving", "Supplier bills & payments"],
    screenshot: "/screenshots/dashboard.png",
    screenshotAlt: `${siteConfig.name} dashboard`,
    path: "procurement",
  },
  {
    id: "manufacturing",
    icon: Factory,
    eyebrow: "Manufacturing",
    title: "Plan production, track it through the floor",
    description:
      "Bills of materials, work orders, and output tracking for businesses that make what they sell, not just resell it.",
    points: ["Bills of materials", "Work orders", "Materials tracking", "Production analytics"],
    screenshot: "/screenshots/dashboard.png",
    screenshotAlt: `${siteConfig.name} dashboard`,
    path: "manufacturing",
  },
];

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#e8a488] uppercase tracking-wide mb-3">Products</p>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Everything your business runs on, in one login
          </h1>
          <p className="text-lg text-white/60">
            Turn on the modules you need today. Add the rest when you&apos;re ready — same account, same data, no migration.
          </p>
        </div>
      </section>

      {modules.map((m, i) => (
        <section key={m.id} id={m.id} className={`py-24 px-4 sm:px-6 lg:px-8 scroll-mt-20 ${i % 2 === 1 ? "bg-surface" : ""}`}>
          <div className="max-w-7xl mx-auto">
            <div className={`flex flex-col ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-12`}>
              <div className="w-full lg:w-1/2">
                <div className="inline-flex items-center gap-2 text-[#6f1a07] text-sm font-semibold mb-4 border-b-2 border-[#6f1a07] pb-1">
                  <m.icon size={15} />
                  {m.eyebrow}
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{m.title}</h2>
                <p className="text-lg text-muted mb-6 leading-relaxed">{m.description}</p>
                <ul className="space-y-3">
                  {m.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-foreground/80">
                      <Check size={18} className="text-emerald-500 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="w-full lg:w-1/2">
                <AppScreenshot src={m.screenshot} alt={m.screenshotAlt} path={m.path} />
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">See it running with your own data</h2>
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors"
          >
            Start Free Trial
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
