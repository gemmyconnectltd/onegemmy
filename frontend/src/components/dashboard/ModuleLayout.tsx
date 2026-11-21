"use client";

import type { ReactNode } from "react";
import { SecondSidebar, type NavConfigItem } from "./SecondSidebar";

import type { ModuleKey } from "@/lib/navigation";

export type { NavConfigItem };

interface ModuleLayoutProps {
  module?: ModuleKey;
  children: ReactNode;
  /** Replace the default module nav (e.g. a custom SecondSidebar with `sections`). */
  renderNav?: (() => ReactNode) | ReactNode;
}

/**
 * A module's pages share one horizontal tab bar under the top bar (design system: module tabs, green text and underline).
 * It scrolls sideways on small screens; there is no second vertical sidebar any more.
 */
export function ModuleLayout({ module, children, renderNav }: ModuleLayoutProps) {
  return (
    <div className="-mx-4 sm:-mx-8 -my-4 sm:-my-6 flex flex-col min-h-[calc(100vh-60px)]">
      {renderNav ? (
        typeof renderNav === "function" ? renderNav() : renderNav
      ) : (
        <SecondSidebar module={module} orientation="top" showToggle={false} />
      )}
      <div className="flex-1 p-4 sm:p-6 min-w-0">{children}</div>
    </div>
  );
}
