"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { SecondSidebar } from "./SecondSidebar";

type ModuleKey =
  | "sales" | "finance" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings";

export function ModuleLayout({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const [orientation, setOrientation] = useState<"top" | "left">("left");

  return (
    <div
      className={`-m-6 ${
        orientation === "left"
          ? "flex flex-col lg:flex-row min-h-[calc(100vh-60px)]"
          : "flex flex-col min-h-[calc(100vh-60px)]"
      }`}
    >
      <SecondSidebar
        module={module}
        orientation={orientation}
        onOrientationChange={setOrientation}
      />
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
