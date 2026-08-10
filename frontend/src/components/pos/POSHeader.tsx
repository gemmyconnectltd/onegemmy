"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Globe, History, Moon, ShoppingCart, Sun, TrendingUp } from "lucide-react";
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
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <header className="flex-shrink-0 z-20 bg-card/90 backdrop-blur border-b border-border">
      <div className="h-14 min-h-[56px] flex items-center px-3 gap-2.5">
        {/* Back */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        <div className="w-px h-5 bg-border" />

        {/* Logo mark + title */}
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm flex-shrink-0">
          <ShoppingCart size={14} />
        </div>
        <div className="leading-tight">
          <span className="text-[13px] font-bold text-foreground">Point of Sale</span>
          <span className="hidden sm:block text-[10px] text-muted-foreground font-mono tabular-nums">
            {date} · {time}
          </span>
        </div>

        {/* Today stats */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full text-primary ml-1">
          <TrendingUp size={12} />
          <span className="text-[11px] font-bold">{todayCount} sold</span>
          <span className="w-px h-3 bg-primary/20" />
          <span className="text-[11px] font-bold font-mono">{currencySymbol} {fmt(todayRevenue)}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Held orders */}
          <button
            onClick={onToggleHeld}
            className={`relative flex items-center gap-1.5 px-2.5 py-2 border rounded-xl text-[12px] font-medium transition-colors ${
              showHeld ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-surface"
            }`}
          >
            <History size={13} />
            <span className="hidden sm:inline">Held</span>
            {heldCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center rounded-full">
                {heldCount}
              </span>
            )}
          </button>

          {/* Language */}
          <div className="relative">
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 px-2.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-surface transition-colors"
            >
              <Globe size={13} />
              <span className="hidden sm:inline">{locales.find((l) => l.code === locale)?.name}</span>
              <ChevronDown size={11} className={`text-muted-foreground transition-transform ${showLang ? "rotate-180" : ""}`} />
            </button>
            {showLang && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-border shadow-lg rounded-xl overflow-hidden z-50 min-w-[140px]">
                {locales.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { onSetLocale(l.code); onToggleLang(); }}
                    className={`w-full text-left px-4 py-2.5 text-[12px] font-medium transition-colors ${
                      locale === l.code ? "bg-primary/10 text-primary" : "hover:bg-surface text-foreground"
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
            className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
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
