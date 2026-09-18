"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SupportFab } from "@/components/dashboard/SupportFab";
import { Topbar } from "@/components/dashboard/Topbar";
import { PageLoader } from "@/components/ui/PageLoader";
import { ProductTour, type TourStep } from "@/components/tour/ProductTour";
import { useAuth } from "@/lib/auth";
import { pageTitleForPath, APP_NAME } from "@/lib/pageTitles";

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to OneGemmy 👋",
    body: "Quick tour of where everything lives — takes about 30 seconds. Skip anytime.",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: "Dashboard",
    body: "Your home base — a snapshot of sales, inventory, and activity across your business.",
  },
  {
    target: '[data-tour="nav-sales"]',
    title: "Sales",
    body: "Record sales, run the POS, and manage orders and customers here.",
  },
  {
    target: '[data-tour="nav-inventory"]',
    title: "Inventory",
    body: "Track stock levels, products, and suppliers.",
  },
  {
    target: '[data-tour="nav-accounting"]',
    title: "Accounting",
    body: "Expenses, invoices, and reports — the money side of the business.",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Settings",
    body: "Manage your team, branding, and company details.",
  },
  {
    target: '[data-tour="user-menu"]',
    title: "Your account",
    body: "Your profile and sign-out live here.",
  },
  {
    title: "You're all set 🎉",
    body: "Look for the support button in the bottom-right corner anytime you want to replay this tour or get help.",
  },
];

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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const sidebarCollapsed = useStoredSidebarCollapsed();

  const setSidebarCollapsed = (v: boolean) => writeStored(COLLAPSED_KEY, v ? "1" : "0");

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

  const sidebarW = sidebarCollapsed ? 64 : 96;

  if (isLoading || !user) return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label={APP_NAME} sub="Signing you in" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface print:hidden">
      <Sidebar
        expanded={false}
        onExpandChange={() => {}}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        className="flex flex-col min-h-screen transition-all duration-200"
        style={{
          marginLeft: isMobile ? 0 : sidebarW,
          paddingBottom: isMobile ? 64 : 0,
        }}
      >
        <Topbar onToggleSidebar={() => {}} sidebarExpanded={false} />
        <main className="flex-1 px-4 sm:px-8 py-4 sm:py-6">{children}</main>
      </div>
      <SupportFab />
      <ProductTour steps={TOUR_STEPS} storageKey="onegemmy_tour_seen" />
    </div>
  );
}
