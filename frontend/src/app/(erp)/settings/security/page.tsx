"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Lock, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import { Field, Input } from "@/components/ui/Form";
import { authApi } from "@/lib/api/auth";
import { NotAvailable, SettingsCard } from "@/components/settings/parts";

export default function SecurityPage() {
  const { brandColor } = useAppConfig();
  const C = brandColor;
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.current || !form.newPass) return;
    if (form.newPass !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.changePassword(form.current, form.newPass);
      setForm({ current: "", newPass: "", confirm: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const detail = (err as { detail?: string })?.detail;
      if (!status) {
        setError("Can't reach the server. Check your connection and try again in a moment.");
      } else if (status === 401 && detail === "Session expired") {
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(detail || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Change password */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ backgroundColor: `${C}15` }}>
            <Lock size={15} style={{ color: C }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Change Password</h2>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 text-sm rounded-lg">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}
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
          <button type="submit" disabled={loading || !form.current || !form.newPass || form.newPass !== form.confirm}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40" style={{ backgroundColor: C }}>
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Updating...</>
            ) : saved ? (
              <><Check size={14} /> Password updated!</>
            ) : (
              <><Lock size={14} /> Update Password</>
            )}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <SettingsCard title="Two-factor authentication"><NotAvailable label="Require a second step at sign-in" hint="Not available yet — your account is protected by its password." /></SettingsCard>
        <SettingsCard title="Active sessions"><NotAvailable label="Signed-in devices" hint="A list of devices, with sign-out, isn't available yet." /></SettingsCard>
      </div>
    </div>
  );
}
