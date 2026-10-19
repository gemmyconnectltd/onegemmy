"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Globe, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { MegaMenuContent, MegaMenuSection, ProductMenuFooter } from "./MegaMenu";
import { marketingMenus, type MarketingMenu } from "@/lib/navigation";
import { appUrl, siteConfig } from "@/lib/site";

type Disclosure = MarketingMenu;
function Brand({ onNavigate }: { onNavigate: () => void }) {
  return <Link href="/" onClick={onNavigate} aria-label={`${siteConfig.name} home`} className="inline-flex shrink-0 items-center gap-2 rounded-lg text-foreground"><span className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9 rounded-lg bg-primary text-white"><LogoMark size={25} strokeWidth={3.5} /></span><span className="text-xl font-bold tracking-tight sm:text-2xl">{siteConfig.name}</span></Link>;
}
export function LandingHeader() {
  const pathname = usePathname();
  const [dropdown, setDropdown] = useState<Disclosure | null>(null);
  const [resourceLeft, setResourceLeft] = useState(16);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<MarketingMenu | null>(null);
  const header = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastPath = useRef(pathname);
  const close = () => { setDropdown(null); setMobileOpen(false); setExpanded(null); };

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    // Covers browser history/programmatic navigation as well as link clicks.
    const timer = window.setTimeout(() => { setDropdown(null); setMobileOpen(false); setExpanded(null); }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  useEffect(() => {
    if (!dropdown) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !(target instanceof Element && target.closest("[data-disclosure]"))) setDropdown(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdown(null);
        header.current?.querySelector<HTMLButtonElement>(`[data-disclosure="${dropdown}"]`)?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [dropdown]);
  useEffect(() => {
    const modal = dialog.current;
    if (!mobileOpen) { if (modal?.open) modal.close(); return; }
    modal?.showModal();
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; if (modal?.open) modal.close(); };
  }, [mobileOpen]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => { setDropdown(null); setMobileOpen(false); };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  function positionResources(trigger: HTMLElement) {
    const bounds = header.current?.getBoundingClientRect();
    if (!bounds) return;
    setResourceLeft(Math.max(16, Math.min(trigger.getBoundingClientRect().left - bounds.left, bounds.width - 376)));
  }
  useEffect(() => {
    if (dropdown !== "resources") return;
    const resize = () => {
      const trigger = header.current?.querySelector<HTMLElement>('[data-disclosure="resources"]');
      if (trigger) positionResources(trigger);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [dropdown]);

  function triggerKey(event: React.KeyboardEvent<HTMLButtonElement>, key: Disclosure) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (key === "resources") positionResources(event.currentTarget);
    setDropdown(key);
    const last = event.key === "ArrowUp";
    requestAnimationFrame(() => {
      const links = panel.current?.querySelectorAll<HTMLAnchorElement>("a");
      links?.[last ? links.length - 1 : 0]?.focus();
    });
  }
  const triggerClass = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-primary/5 hover:text-accent aria-expanded:text-accent";
  const activeMenu = marketingMenus.find(menu => menu.key === dropdown);
  function closeMobile() { setMobileOpen(false); setExpanded(null); mobileTrigger.current?.focus(); }

  return <header ref={header} className="marketing-header relative z-40 border-b border-border bg-white" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setDropdown(null);
  }}>
    <div className="landing-container flex h-[72px] items-center justify-between gap-2 lg:gap-4">
      <Brand onNavigate={close} />
      <nav aria-label="Main navigation" className="hidden items-center gap-4 lg:flex">
        {marketingMenus.map(menu => <button key={menu.key} type="button" data-disclosure={menu.key} aria-expanded={dropdown === menu.key} aria-controls={`mega-${menu.key}`} onKeyDown={event => triggerKey(event, menu.key)} onClick={event => { if (menu.key === "resources") positionResources(event.currentTarget); setDropdown(current => current === menu.key ? null : menu.key); }} className={triggerClass}>{menu.label}<ChevronDown size={14} aria-hidden="true" className={`transition-transform ${dropdown === menu.key ? "rotate-180" : ""}`} /></button>)}
        <Link href="/company" onClick={close} aria-current={pathname === "/company" ? "page" : undefined} className={`${triggerClass} aria-[current=page]:text-accent`}>About</Link>
      </nav>
      <div className="hidden items-center gap-3 lg:flex">
        <span lang="en" aria-label="Website language: English" title="Website language: English" className="inline-flex items-center gap-2 px-2 text-sm font-medium text-muted"><Globe size={16} aria-hidden="true" />English</span>
        <a href={appUrl("/login")} className="landing-secondary text-sm">Sign in</a><a href={appUrl("/register")} className="landing-button text-sm">Get started<ArrowRight size={16} aria-hidden="true" /></a>
      </div>
      <div className="flex shrink-0 items-center gap-2 lg:hidden"><a href={appUrl("/register")} className="landing-button whitespace-nowrap text-sm">Get started<ArrowRight size={15} aria-hidden="true" className="hidden sm:block" /></a><button ref={mobileTrigger} type="button" aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => { setDropdown(null); setMobileOpen(true); }} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"><Menu size={21} aria-hidden="true" /></button></div>
    </div>
    {dropdown && <div className={`absolute top-full hidden lg:block ${dropdown === "resources" ? "" : "inset-x-0"}`} style={dropdown === "resources" ? { left: resourceLeft, width: 360, maxWidth: "calc(100vw - 32px)" } : undefined}><div className={dropdown === "resources" ? "" : "landing-container flex"}><div ref={panel} id={`mega-${dropdown}`} className={`marketing-mega-panel mt-2 w-full overflow-hidden border border-border bg-white ${dropdown === "resources" ? "rounded-lg shadow-lg" : "rounded-2xl shadow-xl"}`} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (index < 0) return;
      event.preventDefault();
      const grid = (document.activeElement as HTMLElement)?.closest(".mega-menu-section")?.querySelector(".grid");
      const step = grid ? window.getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : index + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : event.key === "ArrowLeft" ? -1 : 1);
      links[(next + links.length) % links.length]?.focus();
    }}>
      {activeMenu && <MegaMenuContent key={activeMenu.key} sections={activeMenu.sections} onNavigate={close} preview={dropdown !== "resources"} />}{dropdown === "product" && <ProductMenuFooter onNavigate={close} />}
    </div></div></div>}
    <dialog ref={dialog} id="mobile-navigation" aria-label="Main navigation" onCancel={event => { event.preventDefault(); closeMobile(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right) closeMobile(); } }} className="marketing-mobile-drawer m-0 ml-auto h-dvh max-h-dvh w-full max-w-md border-l border-border bg-white p-0 text-foreground">
      <div className="flex h-full flex-col"><div className="flex shrink-0 items-center justify-between border-b border-border p-5"><Brand onNavigate={closeMobile} /><button ref={closeButton} type="button" aria-label="Close menu" onClick={closeMobile} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"><X size={21} aria-hidden="true" /></button></div>
        <nav aria-label="Mobile main navigation" className="min-h-0 flex-1 overflow-y-auto p-4">{marketingMenus.map(menu => <div key={menu.key} className="border-b border-border"><button type="button" aria-expanded={expanded === menu.key} aria-controls={`mobile-${menu.key}`} onClick={() => setExpanded(current => current === menu.key ? null : menu.key)} className="flex min-h-14 w-full items-center justify-between rounded-lg px-3 text-left text-base font-semibold hover:bg-primary/5">{menu.label}<ChevronDown size={16} aria-hidden="true" className={`transition-transform ${expanded === menu.key ? "rotate-180" : ""}`} /></button>{expanded === menu.key && <div id={`mobile-${menu.key}`} className="space-y-5 pb-4 pt-3">{menu.sections.map(section => <MegaMenuSection key={section.title} section={section} onNavigate={closeMobile} compact />)}{menu.key === "product" && <ProductMenuFooter onNavigate={closeMobile} />}</div>}</div>)}<Link href="/company" onClick={closeMobile} className="flex min-h-14 items-center rounded-lg px-3 font-semibold hover:bg-primary/5">About</Link><p lang="en" className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted"><Globe size={16} aria-hidden="true" />English<Check size={14} aria-label="Current language" /></p></nav>
        <div className="flex shrink-0 gap-3 border-t border-border bg-white p-5"><a href={appUrl("/login")} className="landing-secondary flex-1 text-sm">Sign in</a><a href={appUrl("/register")} className="landing-button flex-1 text-sm">Get started<ArrowRight size={16} aria-hidden="true" /></a></div>
      </div>
    </dialog>
  </header>;
}
