import { ArrowLeft, ChevronDown, Globe, History, TrendingUp } from "lucide-react";
import Link from "next/link";

import { BarcodeStripe } from "./BarcodeStripe";
import { BusinessPicker } from "./BusinessPicker";
import { HeldSalesDrawer } from "./HeldSalesDrawer";
import { IconBadge, getBusinessIcon } from "./icons";
import type { BusinessType, HeldOrder } from "./types";

type LocaleCode = "en" | "rw" | "sw";

interface POSHeaderProps {
  business: BusinessType;
  showBizPicker: boolean;
  heldCount: number;
  heldOrders: HeldOrder[];
  showHeld: boolean;
  todayCount: number;
  todayRevenue: number;
  locale: string;
  locales: readonly { code: LocaleCode; name: string }[];
  currencySymbol: string;
  fmt: (v: number) => string;
  onToggleBizPicker: () => void;
  onSelectBusiness: (id: string) => void;
  onToggleHeld: () => void;
  onResumeHeld: (id: string) => void;
  onDeleteHeld: (id: string) => void;
  onToggleLang: () => void;
  showLang: boolean;
  onSetLocale: (code: LocaleCode) => void;
}

export function POSHeader({
  business, showBizPicker, heldCount, heldOrders, showHeld, todayCount, todayRevenue,
  locale, locales, currencySymbol, fmt, onToggleBizPicker, onSelectBusiness, onToggleHeld,
  onResumeHeld, onDeleteHeld,   onToggleLang, showLang, onSetLocale,
}: POSHeaderProps) {

  return (
    <header className="flex-shrink-0 z-20 bg-white/90 backdrop-blur border-b border-border">
      <div className="h-14 flex items-center px-4 gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[13px] font-medium text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={onToggleBizPicker}
          className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-lg hover:bg-surface transition-colors group"
        >
          <IconBadge Icon={getBusinessIcon(business)} size={16} color={business.accent} className="w-8 h-8" />
          <span className="text-left">
            <span className="block font-bold text-[14px] text-foreground leading-tight">
              {business.label}
            </span>
            <span className="block text-[11px] text-muted leading-tight">{business.tagline}</span>
          </span>
          <ChevronDown
            size={13}
            className={`text-muted transition-transform group-hover:text-foreground ${showBizPicker ? "rotate-180" : ""}`}
          />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 rounded-lg text-accent">
            <TrendingUp size={13} />
            <span className="text-[12px] font-bold">{todayCount}</span>
            <span className="text-[11px] font-medium opacity-80">sold</span>
            <span className="w-px h-3 bg-accent/30 mx-0.5" />
            <span className="text-[12px] font-bold font-mono">{currencySymbol} {fmt(todayRevenue)}</span>
          </div>

          <button
            onClick={onToggleHeld}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[13px] font-medium transition-colors ${
              showHeld ? "border-accent bg-accent/5 text-accent" : "border-border text-foreground hover:bg-surface"
            }`}
          >
            <History size={14} />
            <span className="hidden sm:inline">Held</span>
            {heldCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 min-w-[18px] px-1 bg-accent text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                {heldCount}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[13px] font-medium text-foreground hover:bg-surface transition-colors"
            >
              <Globe size={14} />
              <span className="hidden sm:inline">{locales.find((l) => l.code === locale)?.name}</span>
              <ChevronDown size={12} className={`text-muted transition-transform ${showLang ? "rotate-180" : ""}`} />
            </button>
            {showLang && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-border shadow-lg rounded-xl overflow-hidden z-50 min-w-[140px]">
                {locales.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { onSetLocale(l.code); onToggleLang(); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${
                      locale === l.code ? "bg-accent/10 text-accent" : "hover:bg-surface text-foreground"
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <BarcodeStripe compact />

      {showBizPicker && <BusinessPicker current={business} onSelect={onSelectBusiness} onClose={onToggleBizPicker} />}

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
