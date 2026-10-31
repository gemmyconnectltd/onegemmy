"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth";

/** The one place a screen asks "may this person do that?". Buttons the person can't use are hidden or disabled with this, never shown to fail:
 *  `can("items", "update")`. The server still decides; this only stops the screen offering what would be refused. */
export function useCan() {
  const { hasPermission } = useAuth();
  return useCallback((resource: string, action: "read" | "create" | "update" | "delete" | "approve") => hasPermission(`${resource}:${action}`), [hasPermission]);
}
