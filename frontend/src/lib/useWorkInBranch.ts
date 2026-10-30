"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** Opens an existing ERP page "as this branch": the app's own branch selector is set first (people tied to one branch already
 *  work in it, and the server ignores any other), so the page shows that branch's records. */
export function useWorkInBranch(branchId: string) {
  const router = useRouter();
  const { user, setActiveBranchId } = useAuth();
  return (href: string) => {
    if (!user?.branchId) setActiveBranchId(branchId);
    router.push(href);
  };
}
