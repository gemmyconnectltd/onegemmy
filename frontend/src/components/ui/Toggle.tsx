"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ToggleSize = "sm" | "md" | "lg";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: ToggleSize;
  color?: string;
  label?: string;
  className?: string;
}

const SIZES: Record<
  ToggleSize,
  { track: string; knob: string; onTranslate: string; spinner: number }
> = {
  sm: { track: "h-5 w-9", knob: "top-0.5 left-0.5 h-4 w-4", onTranslate: "translate-x-4", spinner: 10 },
  md: { track: "h-[26px] w-11", knob: "top-[3px] left-[3px] h-5 w-5", onTranslate: "translate-x-[18px]", spinner: 12 },
  lg: { track: "h-8 w-14", knob: "top-1 left-1 h-6 w-6", onTranslate: "translate-x-6", spinner: 14 },
};

export function Toggle({
  checked,
  onChange,
  disabled = false,
  loading = false,
  size = "md",
  color,
  label,
  className,
}: ToggleProps) {
  const s = SIZES[size];
  const busy = disabled || loading;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative rounded-full outline-none transition-colors duration-200 select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        checked ? (color ? "" : "bg-accent") : "bg-muted/30 ring-1 ring-inset ring-black/10",
        busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        s.track,
        className,
      )}
      style={checked && color ? { backgroundColor: color } : undefined}
    >
      <span
        className={cn(
          "absolute rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] flex items-center justify-center",
          "transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          checked ? s.onTranslate : "translate-x-0",
          s.knob,
        )}
      >
        {loading && <Loader2 size={s.spinner} className="animate-spin text-muted-foreground" />}
      </span>
    </button>
  );
}
