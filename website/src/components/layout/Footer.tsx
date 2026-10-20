import Link from "next/link";
import { LogoMark } from "@/components/ui/LogoMark";
import { appUrl, siteConfig } from "@/lib/site";

export function Footer({ appearance = "light", compact = false }: { appearance?: "dark" | "light"; compact?: boolean }) {
  const light = appearance === "light";
  return (
    <footer className={`${light ? "bg-white text-slate-800 border-t border-slate-100" : "bg-[var(--primary-active)] text-white"} ${compact ? "py-7 md:py-8" : light ? "py-10 md:py-12" : "py-12 md:py-16"} ${light ? "" : "px-4 sm:px-6 lg:px-8"}`}>
      <div className={light ? "landing-container" : "max-w-7xl mx-auto"}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] lg:gap-10 mb-8">
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                <LogoMark className="text-white" size={20} />
              </div>
              <div>
                <span className="text-xl font-bold block leading-none">
                  {siteConfig.name}
                </span>

              </div>
            </Link>
            <p className={`${light ? "text-slate-500 text-xs" : "text-white/50 text-sm"} leading-relaxed max-w-sm`}>
              All-in-one business management platform by {siteConfig.company}.
            </p>
          </div>
          <div>
            <h4 className={`font-bold mb-4 ${light ? "text-xs tracking-wide" : "text-sm uppercase tracking-wider"}`}>
              Product
            </h4>
            <ul className={`space-y-2 ${light ? "text-slate-500 text-xs" : "text-white/50 text-sm"}`}>
              <li><Link href="/products/pos" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Point of Sale</Link></li>
              <li><Link href="/products/inventory" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Inventory</Link></li>
              <li><Link href="/products/accounting" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Accounting</Link></li>
              <li><Link href="/products/customers" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Sales &amp; CRM</Link></li>
              <li><Link href="/pricing" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className={`font-bold mb-4 ${light ? "text-xs tracking-wide" : "text-sm uppercase tracking-wider"}`}>
              Company
            </h4>
            <ul className={`space-y-2 ${light ? "text-slate-500 text-xs" : "text-white/50 text-sm"}`}>
              <li><a href="/company#about" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>About us</a></li>
              <li><a href="/company#mission" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Our mission</a></li>
              <li><a href="/company#values" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Our values</a></li>
              <li><a href="/careers" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Careers</a></li>
              <li><a href="/contact" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className={`font-bold mb-4 ${light ? "text-xs tracking-wide" : "text-sm uppercase tracking-wider"}`}>
              Resources
            </h4>
            <ul className={`space-y-2 ${light ? "text-slate-500 text-xs" : "text-white/50 text-sm"}`}>
              <li><Link href="/resources" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Blog</Link></li>
              <li><a href="/impact" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Impact</a></li>
              <li><a href={appUrl("/login")} className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Sign In</a></li>
              <li><a href={appUrl("/register")} className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Get Started</a></li>
            </ul>
          </div>
          <div>
            <h4 className={`font-bold mb-4 ${light ? "text-xs tracking-wide" : "text-sm uppercase tracking-wider"}`}>
              Legal
            </h4>
            <ul className={`space-y-2 ${light ? "text-slate-500 text-xs" : "text-white/50 text-sm"}`}>
              <li><a href="/privacy" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Privacy Policy</a></li>
              <li><a href="/terms" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Terms of Service</a></li>
              <li><a href="/security" className={`inline-block py-0.5 ${light ? "hover:text-accent" : "hover:text-white"} transition-colors`}>Security</a></li>
            </ul>
          </div>
        </div>
        <div className={`border-t ${light ? "border-slate-100" : "border-white/10"} pt-6 flex flex-col md:flex-row justify-between items-center gap-4`}>
          <p className={`${light ? "text-slate-400 text-[11px]" : "text-white/40 text-sm"}`}>
            &copy; {new Date().getFullYear()} {siteConfig.company}. All rights reserved.
          </p>
          <p className={`${light ? "text-slate-400 text-[11px]" : "text-white/40 text-sm"}`}>Built with care in Rwanda</p>
        </div>
      </div>
    </footer>
  );
}
