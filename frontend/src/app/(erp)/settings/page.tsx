"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Store, Download, Shield, Info, Save, Check, ReceiptText, Loader2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Form";
import { Toggle } from "@/components/ui/Toggle";
import { useCurrentTenant, useUpdateMyTenant } from "@/lib/api/hooks";
import type { Tenant } from "@/lib/api";
import { PageLoader } from "@/components/ui/PageLoader";

/** Owns the form's local state, initialized directly from `tenant` — this
 *  component only ever mounts once `tenant` has loaded, so there's no
 *  fetched-then-sync-via-effect step and nothing here is ever stale or fake. */
function ShopInfoForm({ tenant, brandColor }: { tenant: Tenant; brandColor: string }) {
  const updateTenant = useUpdateMyTenant();
  const [shopName, setShopName] = useState(tenant.name ?? "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [address, setAddress] = useState(tenant.address ?? "");
  const [city, setCity] = useState(tenant.city ?? "");
  const [country, setCountry] = useState(tenant.country ?? "");
  const [website, setWebsite] = useState(tenant.website ?? "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await updateTenant.mutateAsync({
        id: tenant.id,
        data: {
          name: shopName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          website: website.trim() || null,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setSaveError((err as { detail?: string })?.detail ?? "Couldn't save your business information. Try again.");
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${brandColor}15` }}>
          <Store size={15} style={{ color: brandColor }} />
        </div>
        <h2 className="text-sm font-bold text-foreground">Shop Information</h2>
      </div>
      <Field label="Shop Name" required>
        <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="My Shop" />
      </Field>
      <Field label="Phone">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 7XX XXX XXX" />
      </Field>
      <Field label="Address">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="KG 7 Ave" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kigali" />
        </Field>
        <Field label="Country">
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Rwanda" />
        </Field>
      </div>
      <Field label="Website">
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
      </Field>
      <button
        type="submit"
        disabled={updateTenant.isPending}
        className="flex items-center gap-1.5 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        style={{ backgroundColor: brandColor }}
      >
        {updateTenant.isPending ? (
          <><Loader2 size={14} className="animate-spin" /> Saving…</>
        ) : saved ? (
          <><Check size={14} /> Saved!</>
        ) : (
          <><Save size={14} /> Save Changes</>
        )}
      </button>
      {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
    </form>
  );
}

export default function SettingsPage() {
  const { brandColor, currency, currencySymbol, currencies, vatEnabled, setVatEnabled } = useAppConfig();
  const currencyName = currencies.find((c) => c.code === currency)?.name ?? currency;
  const C = brandColor;
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateMyTenant();
  const [vatError, setVatError] = useState<string | null>(null);

  const toggleVat = async () => {
    if (!tenant) return;
    const next = !vatEnabled;
    setVatError(null);
    setVatEnabled(next);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { vat_enabled: next } });
    } catch {
      setVatEnabled(!next);
      setVatError("Couldn't update VAT. Try again.");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">General Settings</h1>
        <p className="text-sm text-muted mt-0.5">Manage your shop information and preferences</p>
      </div>

      {tenant ? <ShopInfoForm tenant={tenant} brandColor={C} /> : <PageLoader variant="compact" />}

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Info size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Currency</h2>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">{currency} ({currencySymbol}) &middot; {currencyName}</span>
          <span className="text-xs font-semibold text-muted bg-surface px-2.5 py-1 rounded-full">Locked</span>
        </div>
        <p className="text-xs text-muted">Contact support to change your currency.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <ReceiptText size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">VAT</h2>
        </div>
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{vatEnabled ? "VAT enabled" : "VAT disabled"}</p>
            <p className="text-xs text-muted mt-0.5">
              {vatEnabled
                ? "18% tax is applied to sales and shown on receipts."
                : "No tax is applied to sales or shown on receipts."}
            </p>
          </div>
          <Toggle
            checked={vatEnabled}
            onChange={toggleVat}
            loading={updateTenant.isPending}
            disabled={!tenant}
            label={vatEnabled ? "Disable VAT" : "Enable VAT"}
          />
        </div>
        {vatError && <p className="text-xs text-red-600 dark:text-red-400">{vatError}</p>}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Download size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Data Backup</h2>
        </div>
        <button className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface transition-colors">
          <Download size={14} /> Download Backup
        </button>
        <p className="text-xs text-muted">Last backup: Never</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Shield size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">About</h2>
        </div>
        <p className="text-sm text-muted">Version <span className="font-semibold text-foreground">v0.1.0</span></p>
        <p className="text-sm text-muted">Built by <span className="font-semibold text-foreground">Pesaa</span></p>
      </div>
    </div>
  );
}
