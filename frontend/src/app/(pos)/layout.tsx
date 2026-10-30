import type { ReactNode } from "react";
import { ModuleAvailabilityGuard } from "@/components/auth/ModuleAvailabilityGuard";
import { ActivityTracker } from "@/components/dashboard/ActivityTracker";

export default function POSLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-surface"><ModuleAvailabilityGuard>{children}</ModuleAvailabilityGuard><ActivityTracker /></div>;
}
