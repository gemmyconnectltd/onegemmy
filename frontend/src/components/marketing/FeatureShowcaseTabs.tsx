"use client";

import { useState } from "react";
import { Check, Store, Handshake, Package, Calculator, Users, ShoppingBag } from "lucide-react";
import { AppScreenshot } from "@/components/ui/AppScreenshot";
import { siteConfig } from "@/lib/config";

interface ShowcaseItem {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  screenshot: string;
  screenshotAlt: string;
  path: string;
}

// Lives here (not in the server-rendered page) because its `icon` values are
// component references, which can't cross the server/client prop boundary —
// Next.js can only pass plain serializable data from a Server Component into
// a Client Component.
const showcase: ShowcaseItem[] = [
  {
    icon: Store,
    eyebrow: "Point of Sale",
    title: "A checkout screen built for the counter",
    description:
      "Search or scan a product, ring up the sale, and take cash, mobile money, or card — fast enough for a real line at the register, on any browser you already have.",
    points: ["No special terminal hardware needed", "Cash, Mobile Money, and Card", "Hold a sale and come back to it later"],
    screenshot: "/screenshots/pos-terminal.png",
    screenshotAlt: `${siteConfig.name} point of sale screen with products in the cart, totals, and a payment method selector`,
    path: "pos",
  },
  {
    icon: Package,
    eyebrow: "Inventory",
    title: "Know exactly what's in stock, everywhere",
    description:
      "Track stock across every warehouse in real time, with low-stock alerts and purchase orders that keep you ahead of demand instead of reacting to it.",
    points: ["Multi-warehouse tracking", "Low-stock alerts", "Purchase orders & transfers"],
    screenshot: "/screenshots/inventory-electronics.png",
    screenshotAlt: `${siteConfig.name} inventory overview for an electronics shop, showing stock health, top products by value, and real product photos`,
    path: "inventory",
  },
  {
    icon: Calculator,
    eyebrow: "Accounting",
    title: "Your books, always up to date",
    description:
      "Invoicing, expenses, and financial reports stay in sync with every sale and purchase automatically — no manual reconciliation, no surprises at month end.",
    points: ["Automated invoicing", "Expense tracking", "Real-time P&L"],
    screenshot: "/screenshots/accounting.png",
    screenshotAlt: `${siteConfig.name} accounting overview showing income vs expenses and recent activity`,
    path: "accounting",
  },
  {
    icon: Handshake,
    eyebrow: "Sales & CRM",
    title: "Close deals faster, never lose track of a lead",
    description:
      "A visual pipeline from first contact to closed deal, with quotes, commissions, and targets built in — so your whole sales team works from one source of truth.",
    points: ["Drag-and-drop pipeline", "Quotes & commissions", "Team targets & performance"],
    screenshot: "/screenshots/sales-pipeline.png",
    screenshotAlt: `${siteConfig.name} CRM pipeline showing leads, qualified deals, and closed-won value by stage`,
    path: "crm",
  },
  {
    icon: Users,
    eyebrow: "HR & Payroll",
    title: "Your team, without a separate HR tool",
    description:
      "Attendance, leave, and payroll for your team, tracked alongside the rest of the business — not in a tool nobody logs into.",
    points: ["Employee directory", "Attendance & leave", "Payroll"],
    screenshot: "/screenshots/dashboard.png",
    screenshotAlt: `${siteConfig.name} dashboard`,
    path: "hr",
  },
  {
    icon: ShoppingBag,
    eyebrow: "Purchases",
    title: "Suppliers, purchase orders, and bills in one flow",
    description:
      "Raise a purchase order, receive the goods, and the bill it creates is tracked through to payment — so you always know what you owe and to whom.",
    points: ["Supplier directory", "Purchase orders", "Supplier bills & payments"],
    screenshot: "/screenshots/dashboard.png",
    screenshotAlt: `${siteConfig.name} dashboard`,
    path: "procurement",
  },
];

/** Horizontally-scrollable pill tabs, one per module — picking a tab
 *  crossfades in the copy and the screenshot next to it, so the product
 *  showcase feels like one live screen instead of a long scroll of
 *  stacked sections. */
export function FeatureShowcaseTabs() {
  const [active, setActive] = useState(0);
  const item = showcase[active];

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-10 no-scrollbar snap-x snap-mandatory">
        {showcase.map((it, i) => (
          <button
            key={it.title}
            onClick={() => setActive(i)}
            className={`snap-start flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors whitespace-nowrap ${
              i === active
                ? "bg-[#16a34a] border-[#16a34a] text-white"
                : "border-border text-foreground/60 hover:border-[#16a34a]/40 hover:text-foreground"
            }`}
          >
            <it.icon size={15} />
            {it.eyebrow}
          </button>
        ))}
      </div>

      <div key={active} className="flex flex-col lg:flex-row items-center gap-12 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className="w-full lg:w-1/2">
          <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{item.title}</h3>
          <p className="text-lg text-muted mb-6 leading-relaxed">{item.description}</p>
          <ul className="space-y-3">
            {item.points.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-foreground/80">
                <Check size={18} className="text-emerald-500 flex-shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full lg:w-1/2">
          <AppScreenshot src={item.screenshot} alt={item.screenshotAlt} path={item.path} />
        </div>
      </div>
    </div>
  );
}
