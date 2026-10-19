import { CallToAction } from "@/components/marketing/CallToAction";
import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Store, Package, Calculator, Handshake, Users, Factory, ShoppingBag, Check } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AppScreenshot } from "@/components/ui/AppScreenshot";
import { siteConfig } from "@/lib/site";

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
    title: "A Point-of-Sale System Built for Fast Checkout",
    description:
      "Search or scan a product, ring it up, and take cash, mobile money, or card — fast enough for a real line at the register, on any browser you already have. Every sale updates stock and the books at the same time, automatically.",
    points: ["No special terminal hardware needed", "Cash, Mobile Money, and Card", "Hold a sale and come back to it later", "Works on the same account as the web dashboard"],
    screenshot: "/screenshots/pos-current.webp",
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
    screenshot: "/screenshots/inventory-current.webp",
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
    screenshot: "/screenshots/accounting-current.webp",
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
    screenshot: "/screenshots/crm-current.webp",
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
    screenshot: "/screenshots/hr-current.webp",
    screenshotAlt: `${siteConfig.name} employee directory with team totals, departments and employment status; personal fields redacted`,
    path: "hr",
  },
  {
    id: "procurement",
    icon: ShoppingBag,
    eyebrow: "Purchases",
    title: "Suppliers, purchase orders, and bills in one flow",
    description:
      "Raise a purchase order, receive the goods, and the bill it creates is tracked through to payment — so you always know what you owe and to whom.",
    points: ["Supplier directory", "Purchase orders & requisitions", "Goods receiving", "Supplier bills & payments"],
    screenshot: "/screenshots/purchases-current.webp",
    screenshotAlt: `${siteConfig.name} purchases overview with orders, suppliers and spending`,
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
    screenshot: "/screenshots/manufacturing-current.webp",
    screenshotAlt: `${siteConfig.name} manufacturing overview with production workflows`,
    path: "manufacturing",
  },
];

export default function ProductsPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow="One connected platform" title={<>Every Business Function, One Integrated Platform</>} description={<>Activate the modules your business needs today. Add more as you scale — same account, same data, no migration required.</>} image="/marketing/shop-owner.webp" imageAlt="Illustrative shop owner managing her business on a tablet" />

      {modules.map((m, i) => (
        <section key={m.id} id={m.id} className={`landing-section px-5 sm:px-8 scroll-mt-20 ${i % 2 === 1 ? "bg-surface" : ""}`}>
          <div className="max-w-[1176px] mx-auto">
            <div className={`flex flex-col ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-12`}>
              <div className="w-full lg:w-1/2">
                <div className="inline-flex items-center gap-2 text-[var(--primary)] text-sm font-semibold mb-4 border-b-2 border-[var(--primary)] pb-1">
                  <m.icon size={15} />
                  {m.eyebrow}
                </div>
                <h2 className="landing-title mb-4">{m.title}</h2>
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

      <CallToAction title={<>See the Platform Running With Your Own Data</>} />

      </main>
      <Footer />
    </div>
  );
}
