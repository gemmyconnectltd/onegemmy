"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar, type SidebarLayout } from "@/components/dashboard/Sidebar";
import { SupportFab } from "@/components/dashboard/SupportFab";
import { Topbar } from "@/components/dashboard/Topbar";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/lib/auth";
import { pageTitleForPath } from "@/lib/pageTitles";

const LAYOUT_KEY = "sidebar_layout";
const COLLAPSED_KEY = "sidebar_collapsed";

const STORE_LISTENERS = new Set<() => void>();
function emitStore() {
  for (const l of STORE_LISTENERS) l();
}
function subscribeStore(cb: () => void) {
  STORE_LISTENERS.add(cb);
  window.addEventListener("storage", emitStore);
  return () => {
    STORE_LISTENERS.delete(cb);
    window.removeEventListener("storage", emitStore);
  };
}
function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}
function writeStored(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
  emitStore();
}

function useStoredSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    subscribeStore,
    () => readStored(COLLAPSED_KEY) === "1",
    () => false,
  );
}

function useStoredSidebarLayout(): SidebarLayout {
  return useSyncExternalStore(
    subscribeStore,
    () => {
      const v = readStored(LAYOUT_KEY);
      return v === "horizontal" || v === "vertical" || v === "grid" ? v : "vertical";
    },
    () => "vertical",
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const sidebarCollapsed = useStoredSidebarCollapsed();
  const sidebarLayout = useStoredSidebarLayout();

  const setSidebarCollapsed = (v: boolean) => writeStored(COLLAPSED_KEY, v ? "1" : "0");
  const handleLayoutChange = (l: SidebarLayout) => writeStored(LAYOUT_KEY, l);

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

  const isTopLayout = sidebarLayout !== "vertical";
  const sidebarW = isTopLayout ? 0 : sidebarCollapsed ? 64 : 200;
  const topBarH = sidebarLayout === "grid" ? 64 : sidebarLayout === "horizontal" ? 56 : 0;

  if (isLoading || !user) return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label="OneGemmy" sub="Signing you in" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
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
          marginTop: isMobile ? 0 : topBarH,
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
