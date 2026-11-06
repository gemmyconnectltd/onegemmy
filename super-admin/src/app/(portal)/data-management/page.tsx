"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DataManagementHome } from "@/components/data-management/DataManagementHome";
import { Workspace } from "@/components/data-management/Workspace";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <Workspace key={tenant} tenantId={tenant} /> : <DataManagementHome />;
}
export default function DataManagementPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
