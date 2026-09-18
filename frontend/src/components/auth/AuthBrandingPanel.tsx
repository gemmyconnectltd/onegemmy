import Link from "next/link";
import {
  Layers, ShoppingCart, Warehouse, HandCoins, UserCog, ShoppingBag, BarChart3,
} from "lucide-react";
import { siteConfig } from "@/lib/config";

// Positioned as percentages of their own scoped badge-zone box below — never
// of the whole panel — keeps them from ever colliding with the headline
// text regardless of viewport height.
const FEATURE_BADGES = [
  { icon: ShoppingCart, label: "Sales & POS", style: { top: "4%", left: "2%" } },
  { icon: Warehouse, label: "Inventory", style: { top: "0%", right: "6%" } },
  { icon: HandCoins, label: "Accounting", style: { top: "48%", right: "16%" } },
  { icon: UserCog, label: "HR & Payroll", style: { top: "58%", left: "0%" } },
  { icon: ShoppingBag, label: "Procurement", style: { top: "30%", left: "30%" } },
  { icon: BarChart3, label: "Reports", style: { top: "78%", right: "34%" } },
];

/** Shared left-hand branding panel for the auth pages (login, register) —
 *  logo, floating capability badges, headline, and footer. Kept as one
 *  component so login/register never drift apart visually by accident. */
export function AuthBrandingPanel() {
  return (
    <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-[100px]" />

      <div className="relative z-10 flex flex-col justify-between w-full p-12">
        <div>
          <Link href="/" className="flex items-center gap-2.5 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl flex items-center justify-center">
              <Layers className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold text-white">{siteConfig.name}</span>
          </Link>

          {/* Floating capability badges — confined to this box's own
              coordinate space so they can never collide with the headline
              below, regardless of viewport height. */}
          <div className="hidden xl:block relative h-64 mt-8">
            {FEATURE_BADGES.map(({ icon: Icon, label, style }) => (
              <div
                key={label}
                className="absolute flex items-center gap-2 bg-white/95 rounded-full pl-2.5 pr-3.5 py-2 shadow-xl backdrop-blur-sm"
                style={style}
              >
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <Icon size={12} className="text-accent" />
                </div>
                <span className="text-[12px] font-semibold text-[#1a1209] whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h1 className="text-[40px] font-bold text-white mb-4 leading-[1.15]">
            The Operating System
            <br />
            <span className="text-white/50">for Growing Businesses</span>
          </h1>
          <p className="text-base text-white/40 max-w-sm leading-relaxed">
            Everything your business needs to sell smarter, operate efficiently, and grow
            confidently — all in one platform.
          </p>
        </div>

        <div className="text-white/20 text-xs mt-12">
          &copy; {new Date().getFullYear()} {siteConfig.company}. All rights reserved.
        </div>
      </div>
    </div>
  );
}
