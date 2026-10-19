import { IndustryShowcase } from "@/components/marketing/IndustryShowcase";
import { BusinessProductImage } from "@/components/marketing/BusinessProductImage";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BarChart3, ChevronRight, CircleCheck,
  ClipboardList, Package, Receipt, RefreshCw,
  ShoppingCart, Smartphone, TrendingUp, Truck,
  Users, WifiOff,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import { GlobalReach } from "@/components/marketing/GlobalReach";
import { TrustBadges } from "@/components/marketing/TrustBadges";
import { CallToAction } from "@/components/marketing/CallToAction";
import { appUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = { title: `Home - ${siteConfig.name}` };

const features = [
  { title: "Sales & POS", description: "Fast and flexible sales, from any device.", icon: ShoppingCart, href: "/products/pos" },
  { title: "Inventory Management", description: "Track stock, set alerts and avoid stockouts.", icon: Package, href: "/products/inventory" },
];
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 inline-flex rounded-lg bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase leading-none text-accent">{children}</p>;
}
function CardArrow() {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-foreground transition-colors group-hover:border-primary group-hover:text-accent"><ChevronRight size={18} /></span>;
}

export default function Home() {
  return <div className="pesaa-landing min-h-screen bg-white text-foreground">
    <LandingHeader />
    <main>
      <section aria-labelledby="hero-title" className="overflow-hidden bg-white">
        <div className="landing-container grid items-center gap-4 pb-8 pt-4 lg:min-h-[460px] lg:grid-cols-[1fr_1.05fr] lg:gap-0 lg:py-0">
          <div className="relative z-10 py-5 lg:py-10">
            <Eyebrow>All-in-one business management</Eyebrow>
            <h1 id="hero-title" className="max-w-[560px] text-[clamp(36px,4vw,52px)] font-bold leading-[1.08] tracking-[-0.045em]">Run, grow and<br className="hidden sm:block" /> simplify your<br className="hidden sm:block" /> business <span className="text-accent">with Pesaa</span></h1>
            <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-muted">Manage sales, inventory, finance, staff and multiple branches — all in one powerful and easy-to-use platform.</p>
            <div className="mt-6 flex flex-wrap gap-3"><a href={appUrl("/register")} className="landing-button">Get started <ArrowRight size={16} /></a></div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted"><CircleCheck size={17} className="text-accent" />Built for African businesses</p>
          </div>
          <div className="relative mx-auto h-[340px] w-full max-w-[650px] sm:h-[420px] lg:h-[480px]">
            <div className="absolute inset-y-0 left-0 -right-4 overflow-hidden rounded-lg lg:-right-20 lg:rounded-none"><BusinessProductImage screen="/screenshots/pos-current.webp" src="/marketing/pesaa-tablet-owner.webp" alt="Illustrative shop owner with the designed Pesaa point-of-sale preview on her tablet" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover object-center" /><div className="absolute inset-0 bg-gradient-to-r from-white/75 via-transparent to-transparent" /></div>
            <div aria-label="Illustrative sales example" className="absolute left-0 top-5 w-40 rounded-lg border border-border bg-white/95 p-4 shadow-lg sm:top-12 sm:w-48"><p className="text-xs text-muted">Total sales <span className="text-[10px]">· example</span></p><p className="mt-1 text-base font-bold">RWF 1,250,000</p><div className="mt-4 flex items-end justify-between"><span className="text-[11px] font-semibold text-accent">↑ 12% this week</span><span aria-hidden className="flex items-end gap-1">{[12,19,26,34].map(height => <span key={height} style={{height}} className="w-2 rounded-sm bg-primary" />)}</span></div></div>
            <div aria-label="Illustrative business totals" className="absolute bottom-5 right-0 w-44 space-y-3 rounded-lg border border-border bg-white/95 p-4 shadow-lg sm:bottom-14 sm:w-52">{[{label:"Purchases",value:"660,000",icon:Truck},{label:"Expenses",value:"68,000",icon:Receipt},{label:"Profit",value:"522,000",icon:TrendingUp}].map(item => <div key={item.label} className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent"><item.icon size={20} /></span><div><p className="text-[11px] text-muted">{item.label}</p><p className="text-xs font-bold">RWF {item.value}</p></div></div>)}<p className="text-[10px] text-muted">Illustrative example</p></div>
          </div>
        </div>
      </section>

      <GlobalReach variant="strip" />

      <section id="product" className="landing-container grid scroll-mt-6 items-center gap-8 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:py-12">
        <div><Eyebrow>Real product. Real results.</Eyebrow><h2 className="landing-title max-w-[370px]">A complete dashboard<br /> for better control</h2><p className="landing-description max-w-[380px]">Get a real-time overview of your business. Track sales, manage inventory, monitor expenses and handle multiple branches — all from one place.</p><div className="mt-6 flex flex-wrap items-center gap-3"><Link href="/products" className="landing-button">Explore product <ArrowRight size={16} /></Link></div></div>
        <div className="relative mx-auto w-full max-w-[720px] pb-4"><div className="relative overflow-hidden rounded-lg border-[5px] border-slate-900 bg-slate-900 shadow-xl"><Image src="/screenshots/dashboard-current.webp" alt="Current Pesaa dashboard with sales, expenses and business performance" width={1440} height={900} sizes="(min-width: 1024px) 58vw, 100vw" className="h-auto w-full rounded-md" /></div><div aria-hidden className="absolute bottom-1 -left-3 -right-3 h-3 rounded-b-[50%] bg-gradient-to-b from-slate-200 to-slate-400 shadow-sm" /></div>
      </section>

      <section id="features" className="border-t border-border/50 py-8 lg:py-10"><div className="landing-container"><Eyebrow>Core features</Eyebrow><h2 className="landing-title">Powerful tools to run your business</h2><div className="mt-5 grid items-center gap-5 lg:grid-cols-[1fr_1fr_0.5fr]">{features.map(item => <Link key={item.title} href={item.href} className="landing-card group flex h-full items-center gap-4 p-4 transition-colors hover:border-primary/40"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent"><item.icon size={32} /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-sm leading-snug text-muted">{item.description}</p></div><CardArrow /></Link>)}
          <div aria-hidden className="relative hidden h-40 items-center justify-center rounded-lg bg-gradient-to-br from-primary/5 to-primary/15 lg:flex"><div className="relative w-28 rotate-[18deg] rounded-lg bg-primary p-3 shadow-lg"><div className="mx-auto -mt-10 mb-3 w-20 rounded-t-lg border border-border bg-white p-3"><Receipt size={20} className="mx-auto text-muted" /><div className="mt-2 space-y-1">{[1,2,3].map(n => <div key={n} className="h-1 rounded bg-surface" />)}</div></div><div className="rounded-lg bg-white/95 p-2 text-center text-accent"><ShoppingCart size={22} className="mx-auto" /></div><div className="mt-2 grid grid-cols-3 gap-1">{Array.from({length:9},(_,n)=><span key={n} className="h-2 rounded-sm bg-white/70" />)}</div></div></div>
        </div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-muted">{[{label:"Accounting",icon:ClipboardList,href:"/solutions#accounting"},{label:"Employees",icon:Users,href:"/solutions#hr"},{label:"Reports & insights",icon:BarChart3,href:"/solutions#sales"}].map(item=><Link key={item.label} href={item.href} className="inline-flex items-center gap-2 hover:text-accent"><item.icon size={15} />{item.label}<ChevronRight size={13} /></Link>)}</div></div></section>

      <section id="mobile" className="overflow-hidden bg-primary/5 py-8 lg:py-10"><div className="landing-container grid items-center gap-8 lg:grid-cols-[1fr_0.85fr_0.7fr]">
        <div><Eyebrow>Take Pesaa anywhere</Eyebrow><h2 className="landing-title max-w-[370px]">Manage your business<br /> on the go</h2><p className="landing-description max-w-[370px]">Access your business anytime, anywhere. Make sales, check stock, view reports and manage your team directly from your phone.</p><a href={appUrl("/login")} className="landing-button mt-5"><Smartphone size={17} />Open Pesaa on mobile<ArrowRight size={16} /></a><p className="mt-3 text-xs text-muted">Works in your browser. No app-store download needed.</p></div>
        <div className="relative mx-auto h-[350px] w-full max-w-[350px]"><div className="absolute inset-10 rounded-lg bg-primary/10 blur-2xl" /><div className="absolute left-[5%] top-0 z-10 w-[49%] -rotate-[8deg] overflow-hidden rounded-[28px] border-[5px] border-slate-900 bg-white shadow-xl"><Image src="/screenshots/mobile-home-current.webp" alt="Current Pesaa mobile home screen" width={390} height={844} sizes="(min-width: 1024px) 170px, 44vw" className="h-auto w-full" /></div><div className="absolute right-[4%] top-8 w-[48%] rotate-[9deg] overflow-hidden rounded-[26px] border-[5px] border-slate-900 bg-white shadow-xl"><Image src="/screenshots/mobile-pos-current.webp" alt="Current Pesaa mobile point of sale" width={390} height={844} sizes="(min-width: 1024px) 165px, 44vw" className="h-auto w-full" /></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">{[{title:"Works offline",description:"Keep selling even without internet.",icon:WifiOff},{title:"Automatic sync",description:"Queued sales sync when you reconnect.",icon:RefreshCw}].map(item=><div key={item.title} className="flex items-center gap-3 rounded-lg bg-white/85 p-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent"><item.icon size={25} /></span><div><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p></div></div>)}</div>
      </div></section>

      <IndustryShowcase />

      <section aria-label="Global reach and security" className="bg-primary/5 py-6"><div className="landing-container grid items-center gap-6 md:grid-cols-[1.2fr_0.9fr_1fr]"><GlobalReach variant="summary" /><div className="border-border text-center md:border-x md:px-5"><Image src="/certifications/rra-logo.jpg" alt="Rwanda Revenue Authority" width={93} height={93} className="mx-auto h-20 w-20 object-contain" /><h3 className="mt-2 text-xs font-semibold">Rwanda Revenue Authority</h3><p className="mt-1 text-xs leading-relaxed text-muted">Rwanda tax calculations and reporting.</p></div><TrustBadges inline /></div><CallToAction /></section>
    </main>
    <Footer appearance="light" compact />
  </div>;
}
