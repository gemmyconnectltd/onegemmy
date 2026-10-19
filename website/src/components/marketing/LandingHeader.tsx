"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { appUrl, siteConfig } from "@/lib/site";

const links = [["Product", "/solutions"], ["Solutions", "/#industries"], ["Pricing", "/pricing"], ["Resources", "/resources"], ["About", "/company"], ["Contact", "/contact"]];
const dropdownLinks = {
  solutions: [["Retail stores", "/solutions#pos"], ["Restaurants & cafés", "/solutions#pos"], ["Pharmacies", "/solutions#inventory"], ["Wholesale", "/solutions#inventory"], ["Service businesses", "/solutions"]],
  resources: [["Blog & resources", "/resources"], ["Help & contact", "/contact"], ["Security", "/security"]],
};
type Dropdown = keyof typeof dropdownLinks;

export function LandingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState<Dropdown | null>(null);
  const header = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dropdown) return;
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setDropdown(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDropdown(null); header.current?.querySelector<HTMLButtonElement>(`[data-dropdown="${dropdown}"]`)?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [dropdown]);
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
  const linkClass = "inline-flex min-h-10 items-center gap-1.5 rounded text-[13px] font-medium text-muted transition-colors hover:text-accent";
  function menu(key: Dropdown, label: string) {
    return <div className="relative"><button type="button" data-dropdown={key} aria-expanded={dropdown === key} aria-controls={`header-${key}`} onClick={() => setDropdown(current => current === key ? null : key)} className={linkClass}>{label}<ChevronDown size={12} /></button>{dropdown === key && <div id={`header-${key}`} className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-white p-2 shadow-lg">{dropdownLinks[key].map(([name, href]) => <Link key={name} href={href} onClick={() => setDropdown(null)} className="block rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-primary/5 hover:text-accent">{name}</Link>)}</div>}</div>;
  }
  return <header ref={header} className="relative z-40 bg-white/95"><div className="landing-container flex h-16 items-center justify-between gap-5 lg:h-[72px]">
    <Link href="/" aria-label={`${siteConfig.name} home`} className="flex shrink-0 items-center gap-2 text-foreground"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><LogoMark size={25} strokeWidth={3.5} /></span><span className="text-[24px] font-bold tracking-tight">{siteConfig.name}</span></Link>
    <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex"><Link href="/solutions" aria-current={pathname === "/solutions" ? "page" : undefined} className={linkClass}>Product</Link>{menu("solutions","Solutions")}<Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined} className={linkClass}>Pricing</Link>{menu("resources","Resources")}<Link href="/company" aria-current={pathname === "/company" ? "page" : undefined} className={linkClass}>About</Link></nav>
    <div className="hidden shrink-0 items-center gap-3 lg:flex"><span lang="en" title="English" aria-label="Language: English" className="mr-3 text-xs font-medium text-muted">EN</span><a href={appUrl("/login")} className="landing-secondary min-w-24 rounded-lg text-[13px]">Sign in</a><a href={appUrl("/register")} className="landing-button rounded-lg text-[13px]">Get started<ArrowRight size={16} /></a></div>
    <button ref={button} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(value => !value)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border lg:hidden">{open ? <X size={21} /> : <Menu size={21} />}</button>
  </div>{open && <div ref={panel} id="landing-menu" className="absolute inset-x-0 top-full border-y border-border bg-white px-5 py-5 shadow-lg lg:hidden"><nav aria-label="Mobile main navigation" className="mx-auto flex max-w-xl flex-col">{links.map(([label, href]) => <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-muted hover:bg-primary/5">{label}</Link>)}<a href={appUrl("/login")} className="px-3 py-3 text-sm font-medium">Sign in</a><a href={appUrl("/register")} className="landing-button mt-2 text-sm">Get started<ArrowRight size={16} /></a></nav></div>}</header>;
}
