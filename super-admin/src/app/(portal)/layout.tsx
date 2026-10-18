"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, sidebarWidth } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/lib/auth";
import { pageTitleForPath, APP_NAME } from "@/lib/pageTitles";

// Every page behind this layout needs a signed-in PLATFORM admin (or, for /support only, a support team member). The backend re-checks on every API call; this
// guard keeps the UI (and its code paths) from rendering for anyone else.
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isSuperAdmin, isSupportOnly } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem("admin_sidebar_collapsed") === "1") queueMicrotask(() => setCollapsed(true)); } catch { /* ignore */ }
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { document.title = pageTitleForPath(pathname); }, [pathname]);

  const supportOnly = !!user && isSupportOnly();
  const allowed = !!user && (isSuperAdmin() || supportOnly);
  useEffect(() => {
    if (!isLoading && !allowed) router.replace("/login");
    // Support staff belong in Customer Support only; every other page is for platform admins.
    else if (!isLoading && supportOnly && !pathname.startsWith("/support")) router.replace("/support");
  }, [isLoading, allowed, supportOnly, pathname, router]);

  if (isLoading || !allowed || (supportOnly && !pathname.startsWith("/support"))) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <PageLoader variant="screen" label={APP_NAME} sub="Signing you in" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface" suppressHydrationWarning>
      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      <div className="flex min-w-0 flex-col min-h-screen" style={{ marginLeft: isMobile ? 0 : sidebarWidth(collapsed), paddingBottom: isMobile ? 64 : 0 }}>
        <Topbar />
        <main data-app-content className="min-w-0 flex-1 px-4 sm:px-8 py-4 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
