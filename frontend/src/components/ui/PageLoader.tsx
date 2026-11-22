"use client";

import { Loader2 } from "lucide-react";

interface PageLoaderProps {
  /** Announced to screen readers ("Loading report"). */
  label?: string;
  /** Shown under the spinner on the full-screen variant ("Signing you in"). */
  sub?: string;
  /** screen: before the app shell exists (sign-in, POS start). page: a route's code is loading. compact: a content area. */
  variant?: "screen" | "page" | "compact";
}

const SIZE: Record<NonNullable<PageLoaderProps["variant"]>, { icon: number; box: string }> = {
  screen: { icon: 32, box: "min-h-[50vh]" },
  page: { icon: 28, box: "min-h-[55vh]" },
  compact: { icon: 22, box: "py-16" },
};

export function PageLoader({ variant = "page", label = "Loading", sub }: PageLoaderProps) {
  const { icon, box } = SIZE[variant];
  return (
    <div
      className={`w-full ${box} flex flex-col items-center justify-center gap-3 bg-card/40 backdrop-blur-sm rounded-xl`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 size={icon} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">{label}</span>
      {variant === "screen" && sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}
