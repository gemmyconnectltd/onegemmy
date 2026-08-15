"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SupportFab } from "@/components/dashboard/SupportFab";
import { Topbar } from "@/components/dashboard/Topbar";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/lib/auth";
import { pageTitleForPath } from "@/lib/pageTitles";

const COLLAPSED_KEY = "sidebar_collapsed";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  });
  const [isMobile, setIsMobile] = useState(false);
  const { user, isLoading, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    document.title = pageTitleForPath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading && (!user || !isSuperAdmin())) router.replace("/login");
  }, [isLoading, user, isSuperAdmin, router]);

  if (isLoading || !user) return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label="OneGemmy" sub="Signing you in" />
    </div>
  );

  const sidebarW = sidebarCollapsed ? 64 : 200;

  return (
    <div className="min-h-screen bg-surface" suppressHydrationWarning>
      <Sidebar
        expanded={false}
        onExpandChange={() => {}}
        layout="vertical"
        onLayoutChange={() => {}}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        variant="admin"
      />
      <div
        className="flex flex-col min-h-screen transition-all duration-200"
        style={{
          marginLeft: isMobile ? 0 : sidebarW,
          paddingBottom: isMobile ? 64 : 0,
        }}
      >
        <Topbar variant="admin" onToggleSidebar={() => {}} sidebarExpanded={false} />
        <main className="flex-1 px-4 sm:px-8 py-4 sm:py-6">{children}</main>
      </div>
      <SupportFab />
    </div>
  );
}
