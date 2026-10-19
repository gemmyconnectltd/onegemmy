"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { FeatureShowcaseTabs } from "./FeatureShowcaseTabs";

export function ProductDemo() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <><button ref={trigger} type="button" onClick={() => setOpen(true)} className="landing-secondary px-6 py-3.5 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-white"><Play size={10} fill="currentColor" /></span> Explore demo</button><dialog ref={dialog} aria-labelledby="product-demo-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[1100px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><div><h2 id="product-demo-title" className="text-base font-bold">Explore Pesaa</h2><p className="mt-1 text-xs text-slate-500">A guided look at the existing product screens.</p></div><button type="button" aria-label="Close product demo" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></div><div className="p-5 sm:p-8">{open && <FeatureShowcaseTabs />}</div></dialog></>;
}
