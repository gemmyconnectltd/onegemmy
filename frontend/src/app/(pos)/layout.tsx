import type { ReactNode } from "react";
export default function POSLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-surface">{children}</div>;
}
