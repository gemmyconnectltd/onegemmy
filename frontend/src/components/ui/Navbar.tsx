"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Logo size="md" />

          <div className="hidden md:flex items-center gap-1">
            {MENUS.map((menu) => (
              <div
                key={menu.label}
                className="relative"
                onMouseEnter={() => setActiveMenu(menu.label)}
                onMouseLeave={() => setActiveMenu(null)}
              >
                <button className="flex items-center gap-1 px-3 py-2 text-foreground/60 hover:text-foreground transition-colors font-medium text-sm rounded-lg">
                  {menu.label}
                  <ChevronDown size={14} className={`transition-transform ${activeMenu === menu.label ? "rotate-180" : ""}`} />
                </button>
                {activeMenu === menu.label && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-72">
                    <div className="bg-card border border-border rounded-xl shadow-xl p-2">
                      {menu.links.map((link) => (
                        <Link
                          key={link.label}
                          href={link.href}
                          className="block px-3.5 py-2.5 rounded-lg hover:bg-surface transition-colors"
                        >
                          <p className="text-sm font-semibold text-foreground">{link.label}</p>
                          {link.description && <p className="text-xs text-muted mt-0.5">{link.description}</p>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <Link href="/pricing" className="px-3 py-2 text-foreground/60 hover:text-foreground transition-colors font-medium text-sm rounded-lg">
              Pricing
            </Link>
            <Link href="/contact" className="px-3 py-2 text-foreground/60 hover:text-foreground transition-colors font-medium text-sm rounded-lg">
              Contact
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <a href="/login" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">
              Sign In
            </a>
            <a
              href="/register"
              className="flex items-center gap-1.5 bg-[#16a34a] text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-[#15803d] transition-colors"
            >
              <Sparkles size={14} />
              Get Started
            </a>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-foreground">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-background border-t border-border px-4 pb-4 max-h-[80vh] overflow-y-auto">
          {MENUS.map((menu) => (
            <div key={menu.label} className="py-3 border-b border-border">
              <p className="flex items-center gap-2 text-foreground font-semibold mb-2">
                <menu.icon size={15} />
                {menu.label}
              </p>
              <div className="pl-6 space-y-2.5">
                {menu.links.map((link) => (
                  <Link key={link.label} href={link.href} className="block text-foreground/60 text-sm" onClick={() => setOpen(false)}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link href="/pricing" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border" onClick={() => setOpen(false)}>
            Pricing
          </Link>
          <Link href="/contact" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border" onClick={() => setOpen(false)}>
            Contact
          </Link>
          <a href="/login" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border">
            Sign In
          </a>
          <a
            href="/register"
            className="block bg-[#16a34a] text-white px-5 py-2.5 rounded-lg font-medium text-center mt-3 hover:bg-[#15803d] transition-colors"
          >
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}
