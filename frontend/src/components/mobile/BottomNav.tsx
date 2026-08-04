"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, House, ShoppingBasket, UserRound } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";

const TABS = [
  { href: "/m", label: "Home", icon: House },
  { href: "/m/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/m/account", label: "Account", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useMobilePos();

  const isActive = (href: string) => (href === "/m" ? pathname === "/m" : pathname.startsWith(href));

  return (
    <nav className="flex-shrink-0 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          const showCart = tab.href === "/m" && totalItems > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              {showCart ? (
                <ShoppingBasket size={19} strokeWidth={active ? 2.4 : 2} />
              ) : (
                <tab.icon size={19} strokeWidth={active ? 2.4 : 2} />
              )}
              <span>{tab.label}</span>
              {showCart && (
                <span className="absolute top-1 right-1/2 translate-x-[18px] min-w-[16px] h-4 px-1 bg-accent text-white text-[9px] font-bold flex items-center justify-center rounded-full">
                  {totalItems}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
