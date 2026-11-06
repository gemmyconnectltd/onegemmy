"use client";
import { Suspense } from "react";
import { NewOperation } from "@/components/data-management/NewOperation";
import { PageLoader } from "@/components/ui/PageLoader";

export default function NewOperationPage() { return <Suspense fallback={<PageLoader />}><NewOperation /></Suspense>; }
