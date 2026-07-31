"use client"

import { useState } from "react"
import {
  Settings,
  Store,
  Phone,
  MapPin,
  Download,
  Shield,
  Info,
  Save,
  Check,
} from "lucide-react"

export default function SettingsPage() {
  const [shopName, setShopName] = useState("My Shop")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      {/* Shop Information */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Shop Information</h2>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Shop Name</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Phone className="h-3 w-3" />
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <MapPin className="h-3 w-3" />
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Kigali, Rwanda"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90"
        >
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Currency */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Info className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Currency</h2>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">RWF (Frw)</span>
          <span className="text-xs text-muted">Locked</span>
        </div>
        <p className="text-xs text-muted">
          Contact support to change currency.
        </p>
      </div>

      {/* Data Backup */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Download className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Data Backup</h2>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-border">
          <Download className="h-3.5 w-3.5" />
          Download Backup
        </button>
        <p className="text-xs text-muted">Last backup: Never</p>
      </div>

      {/* About */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2 text-foreground">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">About</h2>
        </div>
        <p className="text-xs text-muted">Version v0.1.0</p>
        <p className="text-xs text-muted">
          Built by Gemmy Connect Ltd
        </p>
      </div>
    </div>
  )
}
