"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Building2, Package, Sparkles, BookOpen } from "lucide-react";
import { Logo } from "./Logo";

interface MenuLink {
  label: string;
  href: string;
  description?: string;
}

interface MenuGroup {
  label: string;
  icon: React.ElementType;
  links: MenuLink[];
}

const MENUS: MenuGroup[] = [
  {
    label: "Company",
    icon: Building2,
    links: [
      { label: "About us", href: "/company#about", description: "Who's behind Pesaa" },
      { label: "Our mission", href: "/company#mission", description: "What we're building toward" },
      { label: "Our values", href: "/company#values", description: "How we work" },
    ],
  },
  {
    label: "Products",
    icon: Package,
    links: [
      { label: "Overview", href: "/solutions", description: "Everything Pesaa does" },
      { label: "Point of Sale", href: "/solutions#pos", description: "Checkout, built for the counter" },
      { label: "Inventory", href: "/solutions#inventory", description: "Stock across every warehouse" },
      { label: "Accounting", href: "/solutions#accounting", description: "Books that stay current" },
      { label: "Sales & CRM", href: "/solutions#sales", description: "Pipeline, quotes, targets" },
      { label: "HR & Payroll", href: "/solutions#hr", description: "Your team, in one place" },
    ],
  },
  {
    label: "Resources",
    icon: BookOpen,
    links: [
      { label: "Blog", href: "/resources", description: "Guides for running your business" },
      { label: "Careers", href: "/company#careers", description: "Join the team" },
    ],
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);                       // mobile / tablet panel
  const [activeMenu, setActiveMenu] = useState<string | null>(null); // desktop dropdown
  const [expanded, setExpanded] = useState<string | null>(null);  // mobile accordion group
  const barRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeAll = useCallback(() => { setOpen(false); setActiveMenu(null); setExpanded(null); }, []);

  // Close after navigating: reset while rendering the new route (no effect, so no extra render pass).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
    setActiveMenu(null);
    setExpanded(null);
  }

  // Lock the page behind the open mobile panel, and close it if the window grows into the desktop layout.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mq.matches) closeAll(); };
    mq.addEventListener("change", onChange);
    return () => { document.body.style.overflow = prev; mq.removeEventListener("change", onChange); };
  }, [open, closeAll]);

  // Escape closes (and hands focus back to the menu button); a click outside closes dropdowns; Tab stays inside the open panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (open || activeMenu)) {
        closeAll();
        toggleRef.current?.focus();
      }
      if (e.key === "Tab" && open && panelRef.current) {
        const items = [toggleRef.current, ...Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button"))].filter(Boolean) as HTMLElement[];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onDown = (e: MouseEvent) => { if (activeMenu && barRef.current && !barRef.current.contains(e.target as Node)) setActiveMenu(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open, activeMenu, closeAll]);

  const linkCls = "px-3 py-2 text-foreground/60 hover:text-foreground transition-colors font-medium text-sm rounded-lg focus-visible:outline-2 focus-visible:outline-[#16a34a]";
  const active = (href: string) => (pathname === href ? "text-foreground" : "");

  return (
    <nav ref={barRef} aria-label="Main" className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Logo size="md" />

          {/* Desktop navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {MENUS.map((menu) => {
              const isOpen = activeMenu === menu.label;
              return (
                <div
                  key={menu.label}
                  className="relative"
                  onMouseEnter={() => setActiveMenu(menu.label)}
                  onMouseLeave={() => setActiveMenu((m) => (m === menu.label ? null : m))}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveMenu((m) => (m === menu.label ? null : m)); }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`menu-${menu.label}`}
                    onClick={() => setActiveMenu(isOpen ? null : menu.label)}
                    className={`flex items-center gap-1 ${linkCls}`}
                  >
                    {menu.label}
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div id={`menu-${menu.label}`} className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-72 max-w-[calc(100vw-2rem)]">
                      <div className="bg-card border border-border rounded-xl shadow-xl p-2">
                        {menu.links.map((link) => (
                          <Link key={link.label} href={link.href} onClick={closeAll} className="block px-3.5 py-2.5 rounded-lg hover:bg-surface focus-visible:bg-surface transition-colors">
                            <p className="text-sm font-semibold text-foreground">{link.label}</p>
                            {link.description && <p className="text-xs text-muted mt-0.5">{link.description}</p>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined} className={`${linkCls} ${active("/pricing")}`}>Pricing</Link>
            <Link href="/contact" aria-current={pathname === "/contact" ? "page" : undefined} className={`${linkCls} ${active("/contact")}`}>Contact</Link>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <a href="/login" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">Sign In</a>
            <a href="/register" className="flex items-center gap-1.5 bg-[#16a34a] text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-[#15803d] transition-colors">
              <Sparkles size={14} />
              Get Started
            </a>
          </div>

          {/* Tablet / mobile trigger */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="lg:hidden -mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-surface"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Tablet / mobile panel: fills the screen under the bar and scrolls on its own */}
      {open && (
        <div
          id="mobile-menu"
          ref={panelRef}
          className="lg:hidden fixed inset-x-0 top-16 sm:top-20 bottom-0 overflow-y-auto overscroll-contain bg-background border-t border-border px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto max-w-2xl">
            {MENUS.map((menu) => {
              const isOpen = expanded === menu.label;
              return (
                <div key={menu.label} className="border-b border-border">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`m-${menu.label}`}
                    onClick={() => setExpanded(isOpen ? null : menu.label)}
                    className="flex w-full min-h-12 items-center gap-2.5 py-3 text-left text-base font-semibold text-foreground"
                  >
                    <menu.icon size={16} className="text-[#16a34a]" />
                    <span className="flex-1">{menu.label}</span>
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <ul id={`m-${menu.label}`} className="pb-2 pl-7">
                      {menu.links.map((link) => (
                        <li key={link.label}>
                          <Link href={link.href} onClick={closeAll} className="block min-h-11 py-2.5 text-[15px] text-foreground/70 hover:text-foreground">
                            {link.label}
                            {link.description && <span className="block text-xs text-muted">{link.description}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <Link href="/pricing" onClick={closeAll} className="flex min-h-12 items-center border-b border-border py-3 text-base font-semibold text-foreground">Pricing</Link>
            <Link href="/contact" onClick={closeAll} className="flex min-h-12 items-center border-b border-border py-3 text-base font-semibold text-foreground">Contact</Link>
            <div className="grid grid-cols-1 gap-2.5 pt-4 sm:grid-cols-2">
              <a href="/login" onClick={closeAll} className="flex min-h-12 items-center justify-center rounded-lg border border-border font-medium text-foreground hover:bg-surface">Sign In</a>
              <a href="/register" onClick={closeAll} className="flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-[#16a34a] font-medium text-white hover:bg-[#15803d]">
                <Sparkles size={15} />
                Get Started
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
