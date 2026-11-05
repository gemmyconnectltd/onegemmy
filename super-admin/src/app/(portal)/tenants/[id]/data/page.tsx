"use client";
import { use } from "react";
import { Workspace } from "@/components/data-management/Workspace";

// Businesses → a business → Data Management: the same workspace as the global page, already pointed at this business.
export default function TenantDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Workspace tenantId={id} />;
}
