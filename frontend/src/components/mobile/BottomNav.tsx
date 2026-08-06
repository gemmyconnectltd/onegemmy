"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, House, ShoppingBasket, UserRound } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";

const LEFT_TABS = [
  { href: "/m", label: "Home", icon: House },
  { href: "/m/transactions", label: "Transactions", icon: ArrowLeftRight },
];

const RIGHT_TABS = [
  { href: "/m/stats", label: "Reports", icon: BarChart3 },
  { href: "/m/account", label: "Account", icon: UserRound },
];

const SELL_PATHS = ["/m/pos", "/m/cart", "/m/payment", "/m/receipt", "/m/held"];

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useMobilePos();

  const isActive = (href: string) => (href === "/m" ? pathname === "/m" : pathname.startsWith(href));
  const isSelling = SELL_PATHS.some((p) => pathname.startsWith(p));

  return (
    <nav className="flex-shrink-0 bg-card border-t border-border pb-[env(safe-area-inset-bottom)] px-1 pt-1">
      <div className="grid grid-cols-5 items-end">
        {LEFT_TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <tab.icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        {/* Center Sell button */}
        <div className="relative flex flex-col items-center">
          <Link
            href="/m/pos"
            aria-label="Sell"
            className="relative -top-3.5 flex flex-col items-center"
          >
            <span
              className={`relative px-5 h-[44px] rounded-full flex items-center justify-center gap-1.5 text-white text-[13px] font-extrabold tracking-wide shadow-lg transition-transform active:scale-95 ${
                isSelling ? "bg-accent shadow-accent/40" : "bg-accent shadow-accent/30"
              }`}
            >
              <ShoppingBasket size={16} strokeWidth={2.3} />
              Sell
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card">
                  {totalItems}
                </span>
              )}
            </span>
          </Link>
        </div>

        {RIGHT_TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <tab.icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
