"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, ReceiptText, UserRound } from "lucide-react";

const TABS = [
  { href: "/m", label: "Home", icon: Home },
  { href: "/m/sales", label: "Sales", icon: ReceiptText },
  { href: "/m/held", label: "Held", icon: History },
  { href: "/m/account", label: "Account", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => (href === "/m" ? pathname === "/m" : pathname.startsWith(href));

  return (
    <nav className="flex-shrink-0 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <tab.icon size={19} strokeWidth={active ? 2.4 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
