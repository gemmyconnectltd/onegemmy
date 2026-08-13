"use client";

import type { ReactNode } from "react";
import { SecondSidebar, type NavConfigItem } from "./SecondSidebar";
import { useAppConfig } from "@/lib/appConfig";

type ModuleKey =
  | "sales" | "finance" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings";

export type { NavConfigItem };

interface ModuleLayoutProps {
  module?: ModuleKey;
  children: ReactNode;
  /** Replace the default module nav (e.g. a custom SecondSidebar with `sections`). */
  renderNav?: (() => ReactNode) | ReactNode;
}

export function ModuleLayout({ module, children, renderNav }: ModuleLayoutProps) {
  const { navOrientation, setNavOrientation } = useAppConfig();
  const isLeft = navOrientation === "left";

  return (
    <div
      className={`-mx-4 sm:-mx-8 -my-6 ${
        isLeft
          ? "flex flex-col lg:flex-row min-h-[calc(100vh-60px)]"
          : "flex flex-col min-h-[calc(100vh-60px)]"
      }`}
    >
      {renderNav ? (
        typeof renderNav === "function" ? renderNav() : renderNav
      ) : (
        <SecondSidebar
          module={module}
          orientation={navOrientation}
          onOrientationChange={setNavOrientation}
        />
      )}
      <div className="flex-1 p-6 min-w-0">{children}</div>
    </div>
  );
}
