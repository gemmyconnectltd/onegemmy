"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Layers, Tag, Ruler, Truck } from "lucide-react";

const sections = [
  { name: "Overview",    href: "/inventory",            icon: LayoutDashboard, exact: true },
  { name: "Products",    href: "/inventory/products",   icon: Package },
  { name: "Categories",  href: "/inventory/categories", icon: Layers },
  { name: "Brands",      href: "/inventory/brands",     icon: Tag },
  { name: "Units",       href: "/inventory/units",      icon: Ruler },
  { name: "Suppliers",   href: "/inventory/suppliers",  icon: Truck },
];

export function InventorySidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-border bg-card px-4 overflow-x-auto">
      {sections.map((s) => {
        const isActive = s.exact
          ? pathname === s.href
          : pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.name}
            href={s.href}
            className={`flex items-center gap-2 px-3 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? "border-accent text-accent"
                : "border-transparent text-foreground/55 hover:text-foreground hover:border-border"
            }`}
          >
            <s.icon size={14} strokeWidth={isActive ? 2.2 : 1.8} className="flex-shrink-0" />
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}
