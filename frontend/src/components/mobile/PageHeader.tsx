"use client";

import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center text-muted"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-foreground truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
