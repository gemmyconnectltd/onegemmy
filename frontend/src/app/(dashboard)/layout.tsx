"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <Topbar
        onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)}
        sidebarExpanded={sidebarExpanded}
      />
      <Sidebar
        expanded={isMobile ? false : sidebarExpanded}
        onExpandChange={setSidebarExpanded}
      />
      <main
        className="pt-14 transition-all duration-200 ease-in-out min-h-screen"
        style={{ marginLeft: isMobile ? 0 : sidebarExpanded ? 240 : 56 }}
      >
        <div className="p-5 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
