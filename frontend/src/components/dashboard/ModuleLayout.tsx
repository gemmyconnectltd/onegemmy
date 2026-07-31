"use client";

import type { ReactNode } from "react";
import { SecondSidebar } from "./SecondSidebar";
import { useAppConfig } from "@/lib/appConfig";

type ModuleKey =
  | "sales" | "finance" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings";

export function ModuleLayout({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { navOrientation, setNavOrientation } = useAppConfig();

  return (
    <div
      className={`-m-6 ${
        navOrientation === "left"
          ? "flex flex-col lg:flex-row min-h-[calc(100vh-60px)]"
          : "flex flex-col min-h-[calc(100vh-60px)]"
      }`}
    >
      <SecondSidebar
        module={module}
        orientation={navOrientation}
        onOrientationChange={setNavOrientation}
      />
      <div className="flex-1 p-6 min-w-0">{children}</div>
    </div>
  );
}
