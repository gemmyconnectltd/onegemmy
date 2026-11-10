"use client";

import { Suspense } from "react";
import { PageLoader } from "@/components/ui/PageLoader";
import { DiscountsWorkspace } from "@/components/discounts/Workspace";

export default function DiscountsPage() { return <Suspense fallback={<PageLoader variant="page" />}><DiscountsWorkspace /></Suspense>; }
