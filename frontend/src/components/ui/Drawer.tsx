"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export type DrawerSide = "left" | "right" | "center";
export type DrawerSize = "sm" | "md" | "lg" | "xl";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  side?: DrawerSide;
  size?: DrawerSize;
  children?: ReactNode;
  footer?: ReactNode;
}

const SIDE_WIDTHS: Record<Exclude<DrawerSide, "center">, Record<DrawerSize, string>> = {
  left: { sm: "sm:w-80", md: "sm:w-96", lg: "sm:w-[420px]", xl: "sm:w-[480px]" },
  right: { sm: "sm:w-80", md: "sm:w-96", lg: "sm:w-[420px]", xl: "sm:w-[480px]" },
};

const CENTER_WIDTHS: Record<DrawerSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

/**
 * Reusable overlay panel. `side="left" | "right"` slides a panel from that edge;
 * `side="center"` renders a centered modal. Closes on backdrop click or Escape and
 * locks body scroll while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  size = "md",
  children,
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const header =
    title || description ? (
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          {title && <h2 className="text-[15px] font-bold text-foreground">{title}</h2>}
          {description && <p className="text-[12px] text-muted mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-foreground transition-colors flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-end px-4 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    );

  if (side === "center") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 animate-drawer-fade" onClick={onClose} aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          className={`relative bg-card border border-border shadow-2xl w-full ${CENTER_WIDTHS[size]} max-h-[90vh] flex flex-col animate-drawer-center`}
        >
          {header}
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="px-5 py-4 border-t border-border flex-shrink-0">{footer}</div>}
        </div>
      </div>
    );
  }

  const isLeft = side === "left";
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 animate-drawer-fade" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 z-50 w-full ${SIDE_WIDTHS[side][size]} bg-card ${
          isLeft ? "left-0 border-r" : "right-0 border-l"
        } border-border shadow-2xl flex flex-col ${isLeft ? "animate-drawer-left" : "animate-drawer-right"}`}
      >
        {header}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex-shrink-0">{footer}</div>}
      </div>
    </>
  );
}
