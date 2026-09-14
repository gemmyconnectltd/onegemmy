import { ArrowLeft, ChevronDown, Globe, History, Moon, Sun, TrendingUp } from "lucide-react";
import Link from "next/link";

import { BarcodeStripe } from "./BarcodeStripe";
import { HeldSalesDrawer } from "./HeldSalesDrawer";
import type { HeldOrder } from "./types";

type LocaleCode = "en" | "rw" | "sw";

interface POSHeaderProps {
  heldCount: number;
  heldOrders: HeldOrder[];
  showHeld: boolean;
  todayCount: number;
  todayRevenue: number;
  locale: string;
  locales: readonly { code: LocaleCode; name: string }[];
  currencySymbol: string;
  fmt: (v: number) => string;
  theme: string;
  onToggleHeld: () => void;
  onResumeHeld: (id: string) => void;
  onDeleteHeld: (id: string) => void;
  onToggleLang: () => void;
  showLang: boolean;
  onSetLocale: (code: LocaleCode) => void;
  onToggleTheme: () => void;
}

export function POSHeader({
  heldCount, heldOrders, showHeld, todayCount, todayRevenue,
  locale, locales, currencySymbol, fmt, theme,
  onToggleHeld, onResumeHeld, onDeleteHeld,
  onToggleLang, showLang, onSetLocale, onToggleTheme,
}: POSHeaderProps) {
  return (
    <header className="flex-shrink-0 z-20 bg-card border-b border-border shadow-sm">
      <div className="h-16 flex items-center px-4 gap-3">
        {/* Back */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground transition-colors px-2.5 py-2 rounded-lg hover:bg-surface"
        >
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        <div className="w-px h-5 bg-border" />

        <span className="text-[15px] font-bold text-foreground tracking-tight">Point of Sale</span>

        {/* Today stats */}
        <div className="hidden md:flex items-center gap-3 pl-3.5 pr-4 py-2 bg-accent/[0.07] border border-accent/10 rounded-xl ml-2">
          <div className="flex items-center gap-1.5 text-accent">
            <TrendingUp size={13} />
            <span className="text-[12px] font-bold">{todayCount}</span>
            <span className="text-[11px] font-medium text-accent/70">sold today</span>
          </div>
          <span className="w-px h-4 bg-accent/20" />
          <span className="text-[13px] font-bold font-mono text-foreground">{currencySymbol} {fmt(todayRevenue)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Held orders */}
          <button
            onClick={onToggleHeld}
            className={`relative flex items-center gap-1.5 px-3 py-2 border rounded-lg text-[12px] font-semibold transition-colors ${
              showHeld ? "border-accent bg-accent/5 text-accent" : "border-border text-foreground hover:bg-surface"
            }`}
          >
            <History size={14} />
            <span className="hidden sm:inline">Held</span>
            {heldCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 bg-accent text-white text-[9px] font-bold flex items-center justify-center rounded-full ring-2 ring-card">
                {heldCount}
              </span>
            )}
          </button>

          {/* Language */}
          <div className="relative">
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-[12px] font-semibold text-foreground hover:bg-surface transition-colors"
            >
              <Globe size={14} />
              <span className="hidden sm:inline">{locales.find((l) => l.code === locale)?.name}</span>
              <ChevronDown size={11} className={`text-muted transition-transform ${showLang ? "rotate-180" : ""}`} />
            </button>
            {showLang && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-border shadow-lg rounded-xl overflow-hidden z-50 min-w-[140px]">
                {locales.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { onSetLocale(l.code); onToggleLang(); }}
                    className={`w-full text-left px-4 py-2.5 text-[12px] font-medium transition-colors ${
                      locale === l.code ? "bg-accent/10 text-accent" : "hover:bg-surface text-foreground"
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="w-9 h-9 flex items-center justify-center border border-border rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      <BarcodeStripe compact />

      {showHeld && (
        <HeldSalesDrawer
          orders={heldOrders}
          currencySymbol={currencySymbol}
          fmt={fmt}
          onResume={onResumeHeld}
          onDelete={onDeleteHeld}
        />
      )}
    </header>
  );
}
