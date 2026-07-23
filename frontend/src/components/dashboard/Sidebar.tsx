"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, Package, DollarSign, Users, FolderKanban, Contact, BarChart3, Settings, Shield } from "lucide-react";

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
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-14 left-0 h-[calc(100vh-56px)] bg-white border-r border-border z-40 transition-all duration-200 ${
          open ? "w-60" : "w-0 overflow-hidden"
        }`}
      >
        <nav className="p-2 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/60 hover:bg-surface hover:text-foreground"
                }`}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
