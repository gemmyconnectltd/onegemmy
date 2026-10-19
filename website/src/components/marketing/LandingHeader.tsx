"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { appUrl, siteConfig } from "@/lib/site";

const links = [
  ["Product", "/solutions"], ["Solutions", "/#industries"], ["Pricing", "/pricing"],
  ["Resources", "/resources"], ["About", "/company"], ["Contact", "/contact"],
];
export function LandingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
      if (event.key === "Tab") {
        const items = [button.current, ...Array.from(panel.current?.querySelectorAll<HTMLElement>("a") ?? [])].filter(Boolean) as HTMLElement[];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => { if (media.matches) setOpen(false); };
    document.addEventListener("keydown", key); media.addEventListener("change", resize);
    return () => { document.removeEventListener("keydown", key); media.removeEventListener("change", resize); };
  }, [open]);
  return <header className="relative z-40 bg-white/95"><div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8 lg:h-24"><Link href="/" aria-label={`${siteConfig.name} home`} className="flex items-center gap-2 text-slate-950"><span className="flex h-10 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white"><LogoMark size={28} strokeWidth={3.5} /></span><span className="text-[27px] font-extrabold tracking-[-1.2px]">{siteConfig.name}</span></Link><nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">{links.map(([label, href]) => <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined} className="rounded text-[13px] font-semibold text-slate-600 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-primary">{label}</Link>)}</nav><div className="hidden items-center gap-3 lg:flex"><a href={appUrl("/login")} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-bold text-slate-800 hover:border-primary">Sign in</a><a href={appUrl("/register")} className="landing-button px-5 py-2.5 text-[13px]">Get started <ArrowRight size={16} /></a></div><button ref={button} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(v => !v)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 lg:hidden">{open ? <X size={21} /> : <Menu size={21} />}</button></div>{open && <div ref={panel} id="landing-menu" className="absolute inset-x-0 top-full border-y border-slate-100 bg-white px-5 py-5 shadow-lg lg:hidden"><nav aria-label="Mobile main navigation" className="mx-auto flex max-w-xl flex-col">{links.map(([label, href]) => <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-surface">{label}</Link>)}<a href={appUrl("/login")} className="px-3 py-3 text-sm font-semibold">Sign in</a><a href={appUrl("/register")} className="landing-button mt-2 px-4 py-3 text-sm">Get started <ArrowRight size={16} /></a></nav></div>}</header>;
}
