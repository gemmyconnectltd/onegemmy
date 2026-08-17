"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api/queryClient";
import { hydrateQueryCache } from "@/lib/offlineSync";
import type { ReactNode } from "react";

function IdbHydrator() {
  useEffect(() => {
    hydrateQueryCache();
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <IdbHydrator />
      {children}
    </QueryClientProvider>
  );
}
