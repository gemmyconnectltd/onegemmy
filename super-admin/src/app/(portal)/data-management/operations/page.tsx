"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { History } from "@/components/data-management/History";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() { return <History tenantId={useSearchParams().get("tenant") ?? undefined} />; }
export default function OperationsPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
