"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, LayoutDashboard, TrendingUp, Package, DollarSign, Users, FolderKanban, Contact, BarChart3, Settings, Shield, LogOut, Menu, X } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Sales", href: "/sales", icon: TrendingUp },
  { name: "Stock & Inventory", href: "/stock", icon: Package },
  { name: "Finance", href: "/finance", icon: DollarSign },
  { name: "HR", href: "/hr", icon: Users },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "CRM", href: "/crm", icon: Contact },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Roles & Permissions", href: "/settings/roles", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 border border-border"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 z-50 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{ background: "var(--sidebar)" }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <Layers className="text-white" size={18} />
            </div>
            <div>
              <span className="text-lg font-bold block leading-none" style={{ color: "var(--sidebar-text-active)" }}>
                OneGemmy
              </span>
              <span className="text-[9px] font-medium tracking-wider uppercase" style={{ color: "var(--sidebar-text)" }}>
                by Gemmy Connect
              </span>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden" style={{ color: "var(--sidebar-text)" }}>
            <X size={18} />
          </button>
        </div>

        <nav className="p-3 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: isActive ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                  background: isActive ? "var(--sidebar-hover)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--primary)", color: "white" }}
            >
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "var(--sidebar-text-active)" }}>John Doe</p>
              <p className="text-xs truncate" style={{ color: "var(--sidebar-text)" }}>Admin</p>
            </div>
            <button style={{ color: "var(--sidebar-text)" }} className="hover:opacity-80 transition-opacity">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
