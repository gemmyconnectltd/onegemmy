"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function BranchesSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/branches"); }, [router]);
  return null;
}
