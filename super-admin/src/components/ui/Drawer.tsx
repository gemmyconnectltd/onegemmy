"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
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
  /** When true, closing (Escape, backdrop, ✕) first asks whether to discard unsaved changes. */
  dirty?: boolean;
}

const DrawerDepth = createContext(0);
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

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
  dirty = false,
}: DrawerProps) {
  const depth = useContext(DrawerDepth);
  const isClient = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [confirming, setConfirming] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); setConfirming(false); } // never carry a pending "discard?" over to the next time it opens
  const requestClose = () => { if (dirty) setConfirming(true); else onClose(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (dirty) setConfirming(true); else onClose(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, dirty]);

  if (!open || !isClient) return null;

  const header =
    title || description ? (
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          {title && <h2 className="pesaa-card-title text-foreground">{title}</h2>}
          {description && <p className="text-[12px] text-muted mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-end px-4 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="text-muted hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    );


  const discardBar = confirming && (
    <div role="alertdialog" aria-label="Discard unsaved changes" className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
      <p className="text-[13px] font-medium text-foreground">Discard your unsaved changes?</p>
      <div className="flex gap-2">
        <button type="button" autoFocus onClick={() => setConfirming(false)} className="min-h-9 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-surface">Keep editing</button>
        <button type="button" onClick={() => { setConfirming(false); onClose(); }} className="min-h-9 rounded-lg bg-red-600 px-3 text-[13px] font-semibold text-white hover:bg-red-700">Discard</button>
      </div>
    </div>
  );

  if (side === "center") {
    return <DrawerDepth.Provider value={depth + 1}>{createPortal(
      <div style={{ zIndex: 100 + depth * 20 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 animate-drawer-fade" onClick={requestClose} aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          className={`relative overflow-hidden bg-card border border-border shadow-2xl w-full ${CENTER_WIDTHS[size]} max-h-[90vh] flex flex-col animate-drawer-center`}
        >
          {header}
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="px-5 py-4 border-t border-border flex-shrink-0">{footer}</div>}
          {discardBar}
        </div>
      </div>, document.body
    )}</DrawerDepth.Provider>;
  }

  const isLeft = side === "left";
  return <DrawerDepth.Provider value={depth + 1}>{createPortal(
    <>
      <div style={{ zIndex: 50 + depth * 20 }} className="fixed inset-0 z-50 bg-black/40 animate-drawer-fade" onClick={requestClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        style={{ zIndex: 50 + depth * 20 }}
        className={`fixed inset-y-0 z-50 w-full ${SIDE_WIDTHS[side][size]} bg-card ${
          isLeft ? "left-0 border-r" : "right-0 border-l"
        } border-border shadow-2xl flex flex-col ${isLeft ? "animate-drawer-left" : "animate-drawer-right"}`}
      >
        {header}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex-shrink-0">{footer}</div>}
        {discardBar}
      </div>
    </>, document.body
  )}</DrawerDepth.Provider>;
}
