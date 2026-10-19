import { CallToAction } from "@/components/marketing/CallToAction";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, BarChart3, Boxes, Building2, CheckCircle2,
  ChevronRight, CircleCheck, ClipboardList, Coins, Globe2, Coffee, GitBranch,
  LayoutGrid, Package,
  Pill, RefreshCw, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  Store, TrendingUp, Users, UtensilsCrossed, WifiOff, Wrench,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import { ProductDemo } from "@/components/marketing/ProductDemo";
import { GlobalReach } from "@/components/marketing/GlobalReach";
import { TrustBadges } from "@/components/marketing/TrustBadges";
import { appUrl, siteConfig } from "@/lib/site";
import countries from "world-countries";
import { getPlatformStats } from "@/lib/publicStats";

export const metadata: Metadata = { title: `Home - ${siteConfig.name}` };

const features = [
  { title: "Sales & POS", description: "Fast, easy checkout for every sale and every kind of business.", icon: ShoppingCart, color: "emerald", href: "/solutions#pos" },
  { title: "Inventory", description: "Know what’s in stock, across your products and branches.", icon: Package, color: "orange", href: "/solutions#inventory" },
  { title: "Accounting", description: "Bring income, expenses and financial reports together.", icon: ClipboardList, color: "blue", href: "/solutions#accounting" },
  { title: "Employees", description: "Manage your people, payroll, roles and permissions.", icon: Users, color: "violet", href: "/solutions#hr" },
  { title: "Reports & Insights", description: "Make informed decisions with clear business reports.", icon: BarChart3, color: "amber", href: "/solutions#sales" },
];
const colors: Record<string, string> = { emerald: "bg-emerald-50 text-emerald-600", orange: "bg-orange-50 text-orange-500", blue: "bg-sky-50 text-sky-500", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-500" };
const industries = [
  { title: "Retail Stores", description: "Shops, supermarkets and boutiques", image: "/marketing/shop-owner.webp", position: "object-[center_30%]", href: "/solutions#pos", icon: Store },
  { title: "Restaurants & Cafés", description: "Keep orders, stock and your team in sync", image: "/marketing/cafe-owner.webp", position: "object-center", href: "/solutions#pos", icon: UtensilsCrossed },
  { title: "Pharmacies", description: "Track products, stock and expiry dates", image: "/marketing/pharmacy-owner.webp", position: "object-center", href: "/solutions#inventory", icon: Pill },
  { title: "Wholesale", description: "Manage bulk sales and your suppliers", image: "/marketing/wholesale-owner.webp", position: "object-center", href: "/solutions#inventory", icon: Boxes },
  { title: "Service Businesses", description: "Bring jobs, customers and payments together", image: "/marketing/service-owner.webp", position: "object-center", href: "/solutions", icon: Wrench },
];
const mobileBenefits = [
  { title: "Fast and secure", description: "Your business, close at hand", icon: ShieldCheck },
  { title: "Works offline", description: "Keep selling when the connection drops", icon: WifiOff },
  { title: "Multiple branches", description: "Stay connected to your locations", icon: Building2 },
  { title: "Automatic sync", description: "Queued sales sync when you reconnect", icon: RefreshCw },
];
const ownerBenefits = [
  { icon: Store, title: "Less admin. More time for customers.", description: "A sale, a stock update and a clear view of your day — all in one place, without the spreadsheet shuffle.", label: "For shop owners", color: "bg-emerald-50 text-emerald-600" },
  { icon: BarChart3, title: "Know how your business is doing.", description: "Follow sales, expenses and performance with reports that help you see what needs your attention.", label: "For everyday decisions", color: "bg-sky-50 text-sky-600" },
  { icon: GitBranch, title: "Grow with everything connected.", description: "Bring more people and branches into the same platform, with access that fits each person’s role.", label: "For growing teams", color: "bg-violet-50 text-violet-600" },
];
function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="landing-eyebrow"><span className="inline-block h-1.5 w-1.5 rounded-sm bg-current" aria-hidden />{children}</p>; }
function Checklist({ items }: { items: string[] }) { return <ul className="space-y-3">{items.map(item => <li key={item} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-slate-600"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" /><span>{item}</span></li>)}</ul>; }

export default async function Home() {
  const stats = await getPlatformStats();
  const highlights = [
    { icon: Users, value: "15,000+", label: `Businesses using ${siteConfig.name}` },
    { icon: Coins, value: "RWF 50B+", label: "In sales processed" },
    { icon: LayoutGrid, value: String(stats.modules), label: "Business modules together" },
    { icon: Globe2, value: String(countries.length), label: "Countries supported" },
    { icon: Smartphone, value: "Web + mobile", label: "Your business, wherever you are" },
    { icon: GitBranch, value: "Multi-branch", label: "One connected business" },
  ].slice(0, 4);
  return <div className="pesaa-landing min-h-screen bg-white text-slate-900">
    <LandingHeader />
    <main>
      <section className="relative overflow-hidden bg-white" aria-labelledby="hero-title">
        <div className="landing-container grid items-center gap-8 pb-10 pt-6 sm:pb-14 lg:min-h-[600px] lg:grid-cols-[1fr_1.05fr] lg:gap-4 lg:pb-0 lg:pt-0">
          <div className="relative z-10 pb-3 pt-4 lg:pb-14 lg:pt-10">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-light)] px-3 py-1.5 text-[11px] font-semibold text-accent"><Sparkles size={12} /> All-in-one business management</span>
            <h1 id="hero-title" className="max-w-[590px] text-[clamp(2.5rem,4.6vw,3.65rem)] font-extrabold leading-[1.07] tracking-[-0.055em] text-[var(--foreground)]">Run, grow and<br className="hidden sm:block" /> simplify your<br className="hidden sm:block" /> <span className="sm:whitespace-nowrap">business <span className="text-[var(--primary)]">with Pesaa</span></span></h1>
            <p className="mt-6 max-w-[450px] text-[16px] leading-[1.75] text-slate-500 sm:text-[17px]">Manage sales, inventory, finance, employees and multiple branches — all in one powerful and easy-to-use platform.</p>
            <div className="mt-7 flex flex-wrap gap-3"><a href={appUrl("/register")} className="landing-button px-7 py-3.5 text-sm">Get started <ArrowRight size={17} /></a><ProductDemo /></div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-medium text-slate-500">{["Easy to use", "Secure & reliable", "Built for African businesses"].map(item => <li key={item} className="inline-flex items-center gap-1.5"><CircleCheck size={14} className="text-[var(--primary)]" />{item}</li>)}</ul>
          </div>
          <div className="relative mx-auto h-[410px] w-full max-w-[620px] sm:h-[520px] lg:h-[620px]">
            <div className="absolute -right-8 inset-y-0 left-0 overflow-hidden rounded-[30px] lg:-right-20 lg:rounded-none"><Image src="/marketing/shop-owner.webp" alt="An illustrative shop owner using a tablet in a bright neighbourhood shop" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover object-[center_35%]" /><div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-transparent lg:from-white lg:via-white/0" /></div>
            <div aria-label="Illustrative sales preview" className="absolute left-1 top-9 w-[165px] rounded-xl border border-white/80 bg-white/95 p-4 shadow-[0_8px_40px_#0b6b3b14] sm:left-0 sm:top-20 sm:w-[190px]"><p className="flex items-center justify-between text-[10px] text-slate-500">Today’s sales <TrendingUp size={12} className="text-emerald-500" /></p><p className="mt-2 text-[18px] font-extrabold tracking-tight">RWF 1,250,000</p><div className="mt-3 flex items-end justify-between"><span className="text-[10px] font-semibold text-emerald-600">↗ 12% <span className="font-normal text-slate-400">example</span></span><span className="flex h-8 items-end gap-1" aria-hidden>{[12,20,29].map(height => <span key={height} style={{height}} className="w-2 rounded-sm bg-[var(--primary)]" />)}</span></div></div>
            <div aria-label="Illustrative product preview" className="absolute -right-1 bottom-10 w-[175px] rounded-xl border border-white/80 bg-white/95 p-3 shadow-[0_8px_40px_#0b6b3b18] sm:bottom-24 sm:right-0 sm:w-[195px]">{[{name:"Fresh bread",price:"1,500",emoji:"🥐"},{name:"Milk",price:"1,200",emoji:"🥛"},{name:"Bananas",price:"800",emoji:"🍌"}].map(product => <div key={product.name} className="flex items-center gap-3 py-2"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-3xl">{product.emoji}</span><div><p className="text-[11px] text-slate-500">{product.name}</p><p className="mt-0.5 text-[11px] font-bold">RWF {product.price}</p></div></div>)}</div>
          </div>
        </div>
      </section>

      <section aria-label="Pesaa platform at a glance" className="border-y border-border bg-[var(--primary-light)]"><div className="landing-container grid grid-cols-2 gap-y-7 py-8 md:grid-cols-4 md:gap-y-0 md:py-10">{highlights.map((item,index) => <div key={item.label} className={`flex items-center gap-3 px-2 sm:px-5 ${index > 0 ? "md:border-l md:border-border" : ""} ${index === 0 ? "md:pl-0" : ""}`}><item.icon size={30} strokeWidth={2.2} className="shrink-0 text-[var(--primary)]" /><div><p className="text-[19px] font-extrabold leading-tight tracking-tight text-[var(--foreground)] sm:text-[26px]">{item.value}</p><p className="mt-1.5 max-w-[180px] text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">{item.label}</p></div></div>)}</div></section>

      <section className="landing-container py-10 text-center sm:py-12"><p className="text-[13px] font-semibold text-slate-700">Built for the businesses that keep Rwanda moving</p><ul className="mt-7 grid grid-cols-3 items-center gap-x-4 gap-y-6 sm:grid-cols-6">{[{name:"Retail",icon:ShoppingBag,color:"text-orange-500"},{name:"Fresh food",icon:Store,color:"text-emerald-600"},{name:"Pharmacies",icon:Pill,color:"text-rose-500"},{name:"Hospitality",icon:Coffee,color:"text-amber-600"},{name:"Wholesale",icon:Boxes,color:"text-lime-600"},{name:"Services",icon:Wrench,color:"text-violet-500"}].map(item=><li key={item.name} className="flex items-center justify-center gap-2"><item.icon size={23} className={item.color} /><span className="text-[11px] font-bold text-slate-600">{item.name}</span></li>)}</ul></section>

      <section id="features" className="landing-container landing-section scroll-mt-6"><div className="landing-section-heading text-center"><Eyebrow>Powerful features</Eyebrow><h2 className="landing-title">Everything you need to run your business</h2><p className="landing-description mx-auto">Pesaa gives you all the tools to manage, track and grow your business in one place.</p></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{features.map(item=><Link key={item.title} href={item.href} className="landing-card group h-full p-4 sm:p-5 transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md"><span className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${colors[item.color]}`}><item.icon size={24} strokeWidth={2.3} /></span><h3 className="flex items-center justify-between gap-2 text-[14px] font-bold tracking-tight">{item.title}<ChevronRight size={13} className="text-slate-300 transition group-hover:text-emerald-500" /></h3><p className="mt-2 text-[12px] leading-[1.65] text-slate-500">{item.description}</p></Link>)}</div></section>

      <section id="showcase" className="landing-section overflow-hidden bg-gradient-to-b from-white via-[#f8fdf9] to-[#eaf9f0]"><div className="landing-container grid items-center gap-9 lg:grid-cols-[0.8fr_1.4fr]"><div><Eyebrow>Simple and powerful</Eyebrow><h2 className="landing-title max-w-[350px]">A modern dashboard<br /> for better control</h2><p className="landing-description max-w-[350px]">Get a complete overview of your business at a glance. Track sales, expenses, profits and more in real time.</p><div className="my-6"><Checklist items={["Real-time business insights", "A clear view across your branches", "Access from web and mobile", "Designed for your business"]} /></div><Link href="/solutions" className="landing-button px-6 py-3 text-sm">Explore product <ArrowRight size={16} /></Link></div><div className="relative pb-5 pt-3"><div className="absolute bottom-3 left-10 right-10 h-10 rounded-full bg-emerald-900/10 blur-xl" /><div className="relative rounded-[15px] border-[7px] border-[#22292d] bg-[#22292d] shadow-xl lg:-mr-10 lg:rotate-[-1.5deg]"><Image src="/screenshots/dashboard-current.webp" alt="Pesaa dashboard with sales, expenses, stock and business reports" width={1440} height={900} sizes="(min-width: 1024px) 65vw, 100vw" className="h-auto w-full rounded-[7px]" /></div><div aria-hidden className="absolute -bottom-0.5 -left-4 right-[-1rem] h-4 rounded-b-[45%] bg-gradient-to-b from-slate-200 to-slate-400 shadow-md" /></div></div></section>

      <section id="industries" className="landing-container landing-section scroll-mt-6"><div className="landing-section-heading text-center"><Eyebrow>For every business</Eyebrow><h2 className="landing-title">Built for different industries</h2><p className="landing-description mx-auto">Whether you run a shop, restaurant, pharmacy or service business, Pesaa adapts to your needs.</p></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{industries.map(item=><Link key={item.title} href={item.href} className="landing-card group flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md"><div className="relative aspect-[4/3] overflow-hidden bg-emerald-50"><Image src={item.image} alt={`${item.title} business environment`} fill sizes="(min-width: 1240px) 224px, (min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw" className={`object-cover transition duration-500 group-hover:scale-105 ${item.position}`} /></div><div className="p-4"><h3 className="text-[14px] font-bold leading-snug">{item.title}</h3><p className="mt-2 text-[12px] leading-relaxed text-slate-500">{item.description}</p></div></Link>)}</div></section>

      <section id="mobile" className="landing-section overflow-hidden bg-[#effaf4]"><div className="landing-container grid items-center gap-8 lg:grid-cols-[1fr_1.05fr_0.65fr]"><div><Eyebrow>Take your business everywhere</Eyebrow><h2 className="landing-title max-w-[390px]">Manage on the go<br /> with the Pesaa mobile app</h2><p className="landing-description max-w-[340px]">Access your business anytime, anywhere, from your phone’s browser. No app-store download needed.</p><div className="my-6"><Checklist items={["Connected to your web account", "Offline sales with automatic sync", "Simple and intuitive", "Your everyday business tools"]} /></div><a href={appUrl("/login")} className="landing-button px-6 py-3 text-sm"><Smartphone size={17} /> Open Pesaa <ArrowRight size={16} /></a><Link href="/solutions#pos" className="mt-3 block text-[11px] font-medium text-emerald-700 hover:underline">Explore mobile selling</Link></div><div className="relative mx-auto h-[420px] w-full max-w-[450px] sm:h-[460px]"><div className="absolute inset-10 rounded-full bg-emerald-200/40 blur-3xl" /><div className="absolute left-[8%] top-0 z-10 w-[49%] rotate-[-8deg] rounded-[30px] border-[6px] border-[#1b2421] bg-white p-1.5 shadow-[0_20px_40px_#14532d2b]"><div aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-slate-800" /><Image src="/screenshots/mobile-home-current.webp" alt="Pesaa mobile home screen with sales overview and business shortcuts" width={390} height={844} sizes="(min-width: 1024px) 240px, 45vw" className="h-auto w-full rounded-[20px]" /></div><div className="absolute right-[3%] top-12 w-[47%] rotate-[9deg] rounded-[28px] border-[6px] border-[#1b2421] bg-white p-1.5 shadow-[0_20px_40px_#14532d2b]"><Image src="/screenshots/mobile-pos-current.webp" alt="Pesaa mobile point of sale with products and checkout" width={390} height={844} sizes="(min-width: 1024px) 220px, 45vw" className="h-auto w-full rounded-[19px]" /></div></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-1">{mobileBenefits.map(item=><div key={item.title} className="flex gap-3 rounded-xl border border-white/80 bg-white/85 p-3.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[var(--primary)]"><item.icon size={23} /></span><div><h3 className="text-[12px] font-bold">{item.title}</h3><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{item.description}</p></div></div>)}</div></div></section>

      <section className="landing-container landing-section"><div className="landing-section-heading text-center"><Eyebrow>Built around business owners</Eyebrow><h2 className="landing-title">More clarity. Less busywork.</h2><p className="landing-description mx-auto">Spend less time on admin and more time building the business you believe in.</p></div><div className="grid gap-4 md:grid-cols-3">{ownerBenefits.map(item=><div key={item.title} className="landing-card h-full p-6"><span className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}><item.icon size={22} /></span><h3 className="text-[15px] font-bold leading-snug">{item.title}</h3><p className="mt-3 text-[13px] leading-relaxed text-slate-500">{item.description}</p><p className="mt-5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><BadgeCheck size={15} />{item.label}</p></div>)}</div></section>

      <GlobalReach compact />
      <TrustBadges compact />

      <CallToAction />
    </main>
    <Footer appearance="light" />
  </div>;
}
