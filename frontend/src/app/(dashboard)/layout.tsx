"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-surface">
      <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main
        className="pt-14 transition-all duration-200"
        style={{ marginLeft: sidebarOpen ? "256px" : "0" }}
      >
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
