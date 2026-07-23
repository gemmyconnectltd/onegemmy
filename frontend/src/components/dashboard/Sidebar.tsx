"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, Package, DollarSign, Users, FolderKanban, Contact, BarChart3, Settings, Shield, X } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Sales", href: "/sales", icon: TrendingUp },
  { name: "Stock", href: "/stock", icon: Package },
  { name: "Finance", href: "/finance", icon: DollarSign },
  { name: "HR", href: "/hr", icon: Users },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "CRM", href: "/crm", icon: Contact },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Roles", href: "/settings/roles", icon: Shield },
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

  return (
    <>
      {/* Mobile overlay */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => onExpandChange(false)}
        />
      )}

      <aside
        className="fixed top-14 left-0 h-[calc(100vh-56px)] bg-white border-r border-border z-40 transition-all duration-200 ease-in-out"
        style={{ width: isOpen ? 220 : 56 }}
        onMouseEnter={() => !expanded && setHovered(true)}
        onMouseLeave={() => !expanded && setHovered(false)}
      >
        {/* Mobile close */}
        {expanded && (
          <button
            onClick={() => onExpandChange(false)}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-muted hover:text-foreground lg:hidden"
          >
            <X size={14} />
          </button>
        )}

        <nav className="p-2 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-[13px] font-medium transition-all duration-150 rounded-lg ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/60 hover:bg-surface hover:text-foreground"
                }`}
                title={!isOpen ? item.name : undefined}
              >
                <item.icon size={18} className="flex-shrink-0" />
                <span
                  className="whitespace-nowrap overflow-hidden transition-all duration-200"
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
