import type { ReactNode } from "react";
import { UsersTabs } from "@/components/users/AccessParts";

// Team & Access: All Users, Access Management and Roles & Permissions share one tab strip (shown only on those three pages).
export default function UsersLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0"><UsersTabs />{children}</div>;
}
