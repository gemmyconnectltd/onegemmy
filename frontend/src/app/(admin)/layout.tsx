"use client";
import { useAuth } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { LayoutDashboard, Building2, Users, LogOut, Shield, BarChart3 } from "lucide-react";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!user || !isSuperAdmin())) {
      router.replace("/login");
    }
  }, [user, isLoading, isSuperAdmin, router]);

  if (isLoading || !user) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-white/10 bg-[#0d0d14]">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-white">OneGemmy</p>
              <p className="text-[10px] text-white/40 font-medium">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? "bg-violet-600/20 text-violet-300" : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2 mb-2">
            <p className="text-[12px] font-semibold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-white/40 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
