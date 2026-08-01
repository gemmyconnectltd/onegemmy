"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar, type SidebarLayout } from "@/components/dashboard/Sidebar";
import { SupportFab } from "@/components/dashboard/SupportFab";
import { Topbar } from "@/components/dashboard/Topbar";
import { useAuth } from "@/lib/auth";
import { pageTitleForPath } from "@/lib/pageTitles";

const LAYOUT_KEY = "sidebar_layout";
const COLLAPSED_KEY = "sidebar_collapsed";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayout>("vertical");

  useEffect(() => {
    const collapsed = localStorage.getItem(COLLAPSED_KEY);
    if (collapsed !== null) setSidebarCollapsed(collapsed === "1");
    const layout = localStorage.getItem(LAYOUT_KEY);
    if (layout === "horizontal" || layout === "vertical") setSidebarLayout(layout);
  }, []);
  const [isMobile, setIsMobile] = useState(false);
  const { user, isLoading } = useAuth();
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
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const handleLayoutChange = (l: SidebarLayout) => {
    setSidebarLayout(l);
    localStorage.setItem(LAYOUT_KEY, l);
  };

  const isHorizontal = sidebarLayout === "horizontal";
  const sidebarW = isHorizontal ? 0 : sidebarCollapsed ? 64 : 200;

  if (isLoading || !user) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface" suppressHydrationWarning>
      <Sidebar
        expanded={false}
        onExpandChange={() => {}}
        layout={sidebarLayout}
        onLayoutChange={handleLayoutChange}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        className="flex flex-col min-h-screen transition-all duration-200"
        style={{
          marginLeft: isMobile ? 0 : sidebarW,
          marginTop: isMobile ? 0 : isHorizontal ? 56 : 0,
          paddingBottom: isMobile ? 64 : 0,
        }}
      >
        <Topbar onToggleSidebar={() => {}} sidebarExpanded={false} />
        <main className="flex-1 px-4 sm:px-8 py-4 sm:py-6">{children}</main>
      </div>
      <SupportFab />
    </div>
  );
}
