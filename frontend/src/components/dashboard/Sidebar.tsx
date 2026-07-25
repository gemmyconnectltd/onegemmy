"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, Receipt,
  Users, BarChart3, Settings, X, ChevronLeft,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Sales", href: "/sales", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
  { name: "Inventory", href: "/inventory", icon: Warehouse },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
}

export function Sidebar({ expanded, onExpandChange }: SidebarProps) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);

  const isOpen = expanded || hovered;

  const handleNavClick = useCallback(() => {
    if (window.innerWidth < 1024) {
      onExpandChange(false);
    }
  }, [onExpandChange]);

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => onExpandChange(false)}
        />
      )}

      <aside
        className="fixed top-14 left-0 h-[calc(100vh-56px)] bg-white border-r border-border z-40 transition-all duration-200 ease-in-out overflow-y-auto overflow-x-hidden"
        style={{ width: isOpen ? 200 : 56 }}
        onMouseEnter={() => !expanded && setHovered(true)}
        onMouseLeave={() => !expanded && setHovered(false)}
      >
        {expanded && (
          <button
            onClick={() => onExpandChange(false)}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-muted hover:text-foreground lg:hidden"
          >
            <X size={14} />
          </button>
        )}

        <nav className="p-2 space-y-px">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className={`group flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-all duration-100 ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-foreground/55 hover:bg-surface hover:text-foreground"
                }`}
                title={!isOpen ? item.name : undefined}
              >
                <item.icon
                  size={18}
                  strokeWidth={isActive ? 2.2 : 1.5}
                  className="flex-shrink-0"
                />
                <span
                  className="whitespace-nowrap overflow-hidden transition-all duration-150"
                  style={{ opacity: isOpen ? 1 : 0, width: isOpen ? "auto" : 0 }}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
