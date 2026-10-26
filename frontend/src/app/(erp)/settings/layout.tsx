import { SettingsShell } from "@/components/settings/SettingsShell";
import type { ReactNode } from "react";

// No second sidebar here: Team & Access, Subscription & Billing and Business Settings are already in the main sidebar's
// Administration group, and Business Settings carries its own tabs (General, Financial, Security, Notifications, Appearance).
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
