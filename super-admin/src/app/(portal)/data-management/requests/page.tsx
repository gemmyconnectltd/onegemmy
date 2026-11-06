"use client";
import { Suspense } from "react";
import { OwnerRequests } from "@/components/data-management/OwnerRequests";
import { PageLoader } from "@/components/ui/PageLoader";

export default function RequestsPage() { return <Suspense fallback={<PageLoader />}><OwnerRequests /></Suspense>; }
