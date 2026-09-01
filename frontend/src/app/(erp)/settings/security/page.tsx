"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Shield, Lock, Eye, EyeOff, Check, Smartphone, Clock } from "lucide-react";
import { Field, Input } from "@/components/ui/Form";

export default function SecurityPage() {
  const { brandColor } = useAppConfig();
  const C = brandColor;
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [twoFA, setTwoFA] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.current || !form.newPass || form.newPass !== form.confirm) return;
    setSaved(true);
    setForm({ current: "", newPass: "", confirm: "" });
    setTimeout(() => setSaved(false), 2500);
  };

  const sessions = [
    { device: "Chrome on macOS",  location: "Kigali, Rwanda", time: "Now",         current: true  },
    { device: "Safari on iPhone", location: "Kigali, Rwanda", time: "2 hours ago", current: false },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Security</h1>
        <p className="text-sm text-muted mt-0.5">Manage your password and account security</p>
      </div>

      {/* Change password */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Lock size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Change Password</h2>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <Field label="Current Password" required>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="••••••••" />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="New Password" required>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} value={form.newPass} onChange={(e) => setForm({ ...form, newPass: e.target.value })} placeholder="••••••••" />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Confirm New Password" required>
            <div className="relative">
              <Input type={showConfirm ? "text" : "password"} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="••••••••" />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          {form.newPass && form.confirm && form.newPass !== form.confirm && (
            <p className="text-[12px] text-red-500 font-medium">Passwords do not match</p>
          )}
          <button type="submit" disabled={!form.current || !form.newPass || form.newPass !== form.confirm}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40" style={{ backgroundColor: C }}>
            {saved ? <><Check size={14} /> Password updated!</> : <><Lock size={14} /> Update Password</>}
          </button>
        </form>
      </div>

      {/* 2FA */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
              <Smartphone size={15} style={{ color: C }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Two-Factor Authentication</h2>
              <p className="text-[11px] text-muted mt-0.5">Add an extra layer of security to your account</p>
            </div>
          </div>
          <button onClick={() => setTwoFA(!twoFA)}
            className={`w-10 h-5 rounded-full transition-colors relative ${twoFA ? "bg-emerald-500" : "bg-border"}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${twoFA ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {twoFA && (
          <p className="text-[12px] text-emerald-600 font-medium bg-emerald-50 px-3 py-2 rounded-lg">
            Two-factor authentication is enabled.
          </p>
        )}
      </div>

      {/* Active sessions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
            <Clock size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Active Sessions</h2>
        </div>
        <div className="divide-y divide-border">
          {sessions.map((s, i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface">
                  <Shield size={14} className="text-muted" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.device}</p>
                  <p className="text-[11px] text-muted">{s.location} · {s.time}</p>
                </div>
              </div>
              {s.current
                ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Current</span>
                : <button className="text-[12px] font-semibold text-red-500 hover:underline">Revoke</button>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
