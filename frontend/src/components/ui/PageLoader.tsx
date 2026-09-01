"use client";

import { Loader2 } from "lucide-react";

interface PageLoaderProps {
  label?: string;
  sub?: string;
  variant?: "screen" | "page" | "compact";
}

const SIZE: Record<NonNullable<PageLoaderProps["variant"]>, { icon: number; box: string }> = {
  screen: { icon: 32, box: "min-h-[50vh]" },
  page: { icon: 28, box: "min-h-[55vh]" },
  compact: { icon: 22, box: "py-16" },
};

export function PageLoader({ variant = "page" }: PageLoaderProps) {
  const { icon, box } = SIZE[variant];
  return (
    <div
      className={`w-full ${box} flex items-center justify-center bg-card/40 backdrop-blur-sm rounded-xl`}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={icon} className="animate-spin text-accent" />
    </div>
  );
}
