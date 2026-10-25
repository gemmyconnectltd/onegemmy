import type { ReactNode } from "react";
import { ActivityTracker } from "@/components/dashboard/ActivityTracker";

export default function POSLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-surface">{children}<ActivityTracker /></div>;
}
