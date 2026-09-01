"use client";

import { Layers } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

interface PageLoaderProps {
  label?: string;
  sub?: string;
  variant?: "screen" | "page" | "compact";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-border/60 animate-pulse rounded-lg ${className}`} />;
}

function Brand({ size }: { size: "sm" | "md" }) {
  const { logoUrl } = useAppConfig();
  const box = size === "sm" ? "w-9 h-9" : "w-12 h-12";
  const ring = size === "sm" ? "inset-0 rounded-xl border-2" : "inset-0 rounded-2xl border-[2.5px]";
  const inner = size === "sm" ? "inset-[9px] rounded-md" : "inset-[12px] rounded-lg";
  const icon = size === "sm" ? 15 : 20;
  return (
    <div className={`relative ${box} flex-shrink-0`}>
      <div className={`absolute ${ring} border-accent/25 border-t-accent animate-spin`} />
      <div className={`absolute ${inner} bg-foreground flex items-center justify-center overflow-hidden`}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Layers size={icon} className="text-white" />
        )}
      </div>
    </div>
  );
}

export function PageLoader({
  label = "Loading…",
  sub = "Getting everything ready",
  variant = "page",
}: PageLoaderProps) {
  if (variant === "screen") {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <Brand size="md" />
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">{label}</p>
          <p className="text-xs text-muted mt-1">{sub}</p>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
        <Brand size="sm" />
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center gap-5 min-h-[55vh]" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Brand size="sm" />
        <div>
          <p className="text-sm font-bold text-foreground">{label}</p>
          <p className="text-xs text-muted">{sub}</p>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`px-5 py-3.5 flex items-center gap-3 ${i < 4 ? "border-b border-border/60" : ""}`}>
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2 max-w-[200px]" />
              <Skeleton className="h-2.5 w-1/3 max-w-[140px]" />
            </div>
            <Skeleton className="h-3.5 w-20 hidden sm:block" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
