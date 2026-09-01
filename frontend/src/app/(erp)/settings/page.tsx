"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Settings, Store, Phone, MapPin, Download, Shield, Info, Save, Check } from "lucide-react";
import { Field, Input, FormFooter } from "@/components/ui/Form";

export default function SettingsPage() {
  const { brandColor } = useAppConfig();
  const C = brandColor;
  const [shopName, setShopName] = useState("My Shop");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">General Settings</h1>
        <p className="text-sm text-muted mt-0.5">Manage your shop information and preferences</p>
      </div>

      <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Store size={15} style={{ color: C }} />
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
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Kigali, Rwanda" />
        </Field>
        <button type="submit" className="flex items-center gap-1.5 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors" style={{ backgroundColor: C }}>
          {saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
        </button>
      </form>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Info size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Currency</h2>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">RWF (Frw)</span>
          <span className="text-xs font-semibold text-muted bg-surface px-2.5 py-1 rounded-full">Locked</span>
        </div>
        <p className="text-xs text-muted">Contact support to change your currency.</p>
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
        <p className="text-sm text-muted">Built by <span className="font-semibold text-foreground">Gemmy Connect Ltd</span></p>
      </div>
    </div>
  );
}
