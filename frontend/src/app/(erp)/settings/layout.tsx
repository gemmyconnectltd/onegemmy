import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="settings">{children}</ModuleLayout>;
}
