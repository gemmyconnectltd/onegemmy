"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SupportFab } from "@/components/dashboard/SupportFab";
import { Topbar } from "@/components/dashboard/Topbar";
import { useAuth } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar expanded={sidebarExpanded} onExpandChange={setSidebarExpanded} />
      <div
        className="flex flex-col min-h-screen transition-all duration-200"
        style={{ marginLeft: isMobile ? 0 : 88, paddingBottom: isMobile ? 64 : 0 }}
      >
        <Topbar onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)} sidebarExpanded={sidebarExpanded} />
        <main className="flex-1 px-4 sm:px-8 py-4 sm:py-6">{children}</main>
      </div>
      <SupportFab />
    </div>
  );
}
