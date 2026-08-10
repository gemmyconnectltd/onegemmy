import Link from "next/link";
import { ArrowLeft, Compass, Home, ReceiptText, ShoppingCart, TrendingUp } from "lucide-react";

const quickLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/pos", label: "Sell now", icon: ShoppingCart },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/stats", label: "Reports", icon: TrendingUp },
];

export default function NotFound() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-28 h-28 rounded-full border border-primary/10 animate-ping" aria-hidden style={{ animationDuration: "3s" }} />
        <div className="absolute w-20 h-20 rounded-full border border-primary/10" aria-hidden />
        <div className="relative w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
          <Compass size={24} strokeWidth={1.8} />
        </div>
      </div>

      <div className="space-y-1.5">
        <h1 className="text-[52px] leading-none font-extrabold tracking-tight text-foreground">
          <span className="text-primary">4</span>0<span className="text-primary">4</span>
        </h1>
        <p className="text-base font-semibold text-foreground">Page not found</p>
        <p className="text-[13px] text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center justify-center gap-1.5 w-full max-w-[260px] px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      <div className="w-full max-w-[320px] rounded-2xl border border-border bg-card p-2">
        <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">
          Quick access
        </p>
        <div className="grid grid-cols-4 gap-1">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl text-muted-foreground active:bg-muted active:text-foreground transition-colors"
            >
              <Icon size={17} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
