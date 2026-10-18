import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import { SettingsShell } from "@/components/settings/SettingsShell";
import type { ReactNode } from "react";
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="settings"><SettingsShell>{children}</SettingsShell></ModuleLayout>;
}
