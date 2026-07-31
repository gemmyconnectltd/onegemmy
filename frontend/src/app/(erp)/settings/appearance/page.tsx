"use client";

import { useAppConfig } from "@/lib/appConfig";
import { businessThemes, businessThemesDark, type BusinessType } from "@/lib/config";
import { Check, Moon, Sun } from "lucide-react";

export default function AppearancePage() {
  const { businessType, setBusinessType, businessTypes, locale, setLocale, locales, currency, setCurrency, currencies, theme, setTheme } = useAppConfig();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Appearance</h1>
        <p className="text-sm text-muted mt-1">Customize the look and feel of your dashboard.</p>
      </div>

      {/* Theme */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Theme</h2>
          <p className="text-[13px] text-muted mt-0.5">Choose between light and dark mode.</p>
        </div>
        <div className="flex gap-3">
          {([
            { id: "light" as const, name: "Light", icon: Sun },
            { id: "dark" as const, name: "Dark", icon: Moon },
          ]).map((t) => {
            const isActive = theme === t.id;
            const preview = t.id === "dark" ? businessThemesDark[businessType] : businessThemes[businessType];
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`relative flex-1 p-4 border-2 text-left transition-all ${
                  isActive ? "border-accent" : "border-border hover:border-foreground/20"
                }`}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-accent text-white flex items-center justify-center rounded-full">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <div
                  className="w-full h-16 mb-3 border border-border/50 overflow-hidden flex"
                  style={{ backgroundColor: preview.background }}
                >
                  <div className="w-4 h-full" style={{ backgroundColor: preview.accent }} />
                  <div className="flex-1 p-1.5 space-y-1">
                    <div className="h-2 rounded-full w-3/4" style={{ backgroundColor: preview.foreground, opacity: 0.3 }} />
                    <div className="h-2 rounded-full w-1/2" style={{ backgroundColor: preview.primary, opacity: 0.5 }} />
                    <div className="h-2 rounded-full w-2/3" style={{ backgroundColor: preview.muted, opacity: 0.3 }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <t.icon size={16} className={isActive ? "text-accent" : "text-muted"} />
                  <p className="text-[13px] font-semibold text-foreground">{t.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Business Type */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Business Type</h2>
          <p className="text-[13px] text-muted mt-0.5">Each type applies its own color theme across the whole dashboard.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {businessTypes.map((bt) => {
            const theme = businessThemes[bt.code as BusinessType];
            const isActive = businessType === bt.code;
            return (
              <button
                key={bt.code}
                onClick={() => setBusinessType(bt.code as BusinessType)}
                className={`relative p-4 border-2 text-left transition-all ${
                  isActive ? "border-accent" : "border-border hover:border-foreground/20"
                }`}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-accent text-white flex items-center justify-center rounded-full">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                {/* Mini theme preview */}
                <div
                  className="w-full h-10 mb-3 border border-border/50 overflow-hidden flex"
                  style={{ backgroundColor: theme.background }}
                >
                  <div className="w-4 h-full" style={{ backgroundColor: theme.accent }} />
                  <div className="flex-1 p-1 space-y-1">
                    <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: theme.foreground, opacity: 0.3 }} />
                    <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: theme.primary, opacity: 0.5 }} />
                    <div className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: theme.muted, opacity: 0.3 }} />
                  </div>
                </div>
                <div className="text-xl mb-1">{bt.icon}</div>
                <p className="text-[13px] font-semibold text-foreground">{bt.name}</p>
                <div className="flex gap-1 mt-2">
                  {[theme.accent, theme.primary, theme.surface, theme.border].map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border border-border/30" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Language */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-foreground">Language</h2>
        <div className="flex gap-2">
          {locales.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={`px-4 py-2 text-[13px] font-semibold border transition-colors ${
                locale === l.code ? "bg-accent text-white border-accent" : "border-border text-foreground/60 hover:text-foreground"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </section>

      {/* Currency */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-foreground">Currency</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code)}
              className={`flex items-center gap-2 px-3 py-2.5 border text-left transition-colors ${
                currency === c.code ? "border-accent bg-accent/5" : "border-border hover:border-foreground/20"
              }`}
            >
              <span className="text-[15px] font-bold w-8 text-accent">{c.symbol}</span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">{c.code}</p>
                <p className="text-[11px] text-muted">{c.name}</p>
              </div>
              {currency === c.code && <Check size={13} className="ml-auto text-accent" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
