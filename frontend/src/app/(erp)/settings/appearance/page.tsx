"use client";

import { useRef, useState } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { DEFAULT_BRAND_COLOR } from "@/lib/config";
import { useCurrentTenant, useUpdateMyTenant, useUploadMyTenantLogo } from "@/lib/api/hooks";
import { Check, Moon, Sun, Upload, Loader2, Building2, X } from "lucide-react";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function AppearancePage() {
  const {
    theme, setTheme, brandColor, setBrandColor, logoUrl, setLogoUrl, brandColorPresets,
    locale, setLocale, locales, currency, setCurrency, currencies,
  } = useAppConfig();
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateMyTenant();
  const uploadLogo = useUploadMyTenantLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hexInput, setHexInput] = useState(brandColor);
  const [error, setError] = useState<string | null>(null);

  const applyBrandColor = async (hex: string) => {
    if (!tenant) return;
    const previous = brandColor;
    setBrandColor(hex);
    setHexInput(hex);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { brand_color: hex } });
    } catch {
      setBrandColor(previous);
      setHexInput(previous);
      setError("Couldn't save your brand color. Try again.");
    }
  };

  const handleLogoFile = async (file: File) => {
    if (!tenant) return;
    setError(null);
    try {
      const res = await uploadLogo.mutateAsync({ id: tenant.id, file });
      setLogoUrl(res.data.logo_url);
    } catch {
      setError("Couldn't upload that logo. Use a PNG, JPEG or WEBP under 2MB.");
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Appearance</h1>
        <p className="text-sm text-muted mt-1">Customize the look and feel of your dashboard.</p>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border border-red-200 bg-red-50 text-red-700 text-[13px] rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

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
                <div className="flex items-center gap-2">
                  <t.icon size={16} className={isActive ? "text-accent" : "text-muted"} />
                  <p className="text-[13px] font-semibold text-foreground">{t.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Brand Color */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Brand Color</h2>
          <p className="text-[13px] text-muted mt-0.5">
            Applies everywhere across your dashboard — same for everyone at your company.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {brandColorPresets.map((hex) => {
            const isActive = brandColor.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                onClick={() => applyBrandColor(hex)}
                title={hex}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform ${isActive ? "scale-110 ring-2 ring-offset-2 ring-foreground/30" : "hover:scale-105"}`}
                style={{ backgroundColor: hex }}
              >
                {isActive && <Check size={14} className="text-white" strokeWidth={3} />}
              </button>
            );
          })}
          <div className="flex items-center gap-1.5 pl-2 border-l border-border">
            <input
              type="color"
              value={HEX_RE.test(hexInput) ? hexInput : DEFAULT_BRAND_COLOR}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => HEX_RE.test(hexInput) && applyBrandColor(hexInput)}
              className="w-9 h-9 rounded-full border-0 cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => HEX_RE.test(hexInput) ? applyBrandColor(hexInput) : setHexInput(brandColor)}
              placeholder="#6f1a07"
              className="w-24 px-2.5 py-2 text-[13px] font-mono border border-border rounded-lg bg-card text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          {updateTenant.isPending && <Loader2 size={14} className="animate-spin text-muted" />}
        </div>
      </section>

      {/* Company Logo */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Company Logo</h2>
          <p className="text-[13px] text-muted mt-0.5">PNG, JPEG or WEBP, up to 2MB.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-border bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={22} className="text-muted" />
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLogo.isPending || !tenant}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[13px] font-semibold text-foreground hover:border-accent transition-colors disabled:opacity-50"
          >
            {uploadLogo.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoFile(file);
              e.target.value = "";
            }}
          />
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
              className={`px-4 py-2 text-[13px] font-semibold border rounded-lg transition-colors ${
                locale === l.code ? "bg-accent text-white border-transparent" : "border-border text-foreground/60 hover:text-foreground"
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
