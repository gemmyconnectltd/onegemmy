"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessPicker } from "@/components/data-management/BusinessPicker";
import { Workspace } from "@/components/data-management/Workspace";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <Workspace key={tenant} tenantId={tenant} /> : <BusinessPicker />;
}
export default function DataManagementPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
