"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Save, X } from "lucide-react";
import type { TenantLimits } from "@/lib/api/admin";
import {
  useResetTenantFeatures,
  useSetTenantFeatures,
  useSetTenantLimits,
  useTenantFeatures,
  useTenantLimits,
} from "@/lib/api/hooks";
import { Field, Input } from "@/components/ui/Form";
import { Toggle } from "@/components/ui/Toggle";

const LIMIT_FIELDS: { key: keyof TenantLimits; label: string; hint: string; placeholder: string }[] = [
  { key: "max_users", label: "Max Users", hint: "Total users allowed in the company", placeholder: "Unlimited" },
  { key: "max_branches", label: "Max Branches", hint: "Total branches allowed", placeholder: "Unlimited" },
  { key: "max_products", label: "Max Products", hint: "Total product SKUs allowed", placeholder: "Unlimited" },
  { key: "max_storage_mb", label: "Storage (MB)", hint: "Upload/logo storage allowance", placeholder: "Unlimited" },
];

export default function FeaturesPanel({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { data: features, isLoading: featuresLoading } = useTenantFeatures(tenantId);
  const { data: limits, isLoading: limitsLoading } = useTenantLimits(tenantId);

  const setFeatures = useSetTenantFeatures();
  const resetFeatures = useResetTenantFeatures();
  const setLimits = useSetTenantLimits();

  const featuresKey = useMemo(() => ["admin", "tenants", tenantId, "features"] as const, [tenantId]);
  const limitsKey = useMemo(() => ["admin", "tenants", tenantId, "limits"] as const, [tenantId]);

  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [limitsDraft, setLimitsDraft] = useState<Record<string, string>>({});
  const [draftTouched, setDraftTouched] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const enabledMap = useMemo(() => {
    const base = features ? Object.fromEntries(features.map((f) => [f.key, f.enabled])) : {};
    return { ...base, ...dirty };
  }, [features, dirty]);

  const overridesFor = (map: Record<string, boolean>) => {
    if (!features) return {};
    const out: Record<string, boolean> = {};
    for (const f of features) {
      if (map[f.key] !== f.default_enabled) out[f.key] = map[f.key];
    }
    return out;
  };

  const handleToggle = (key: string, value: boolean) => {
    const next = { ...dirty, [key]: value };
    setDirty(next);
    setNotice(null);
    setFeatures.mutate(
      { tenantId, features: overridesFor({ ...enabledMap, [key]: value }) },
      {
        onSuccess: (res) => {
          queryClient.setQueryData(featuresKey, res);
          setDirty({});
          setNotice({ kind: "success", text: "Features updated" });
        },
        onError: () => {
          setDirty({});
          setNotice({ kind: "error", text: "Failed to update features" });
        },
      },
    );
  };

  const handleReset = () => {
    setNotice(null);
    resetFeatures.mutate(tenantId, {
      onSuccess: (res) => {
        queryClient.setQueryData(featuresKey, res);
        setDirty({});
        setNotice({ kind: "success", text: "Features reset to platform defaults" });
      },
      onError: () => setNotice({ kind: "error", text: "Failed to reset features" }),
    });
  };

  const handleSaveLimits = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: TenantLimits = { max_users: null, max_branches: null, max_products: null, max_storage_mb: null };
    for (const { key } of LIMIT_FIELDS) {
      const raw = limitsDraft[key]?.trim() ?? "";
      if (raw === "") payload[key] = null;
      else {
        const n = parseInt(raw, 10);
        payload[key] = Number.isNaN(n) || n < 0 ? null : n;
      }
    }
    setNotice(null);
    setLimits.mutate(
      { tenantId, data: payload },
      {
        onSuccess: (res) => {
          queryClient.setQueryData(limitsKey, res);
          setDraftTouched(false);
          setLimitsDraft({});
          setNotice({ kind: "success", text: "Usage limits saved" });
        },
        onError: () => setNotice({ kind: "error", text: "Failed to save usage limits" }),
      },
    );
  };

  const limitValue = (key: keyof TenantLimits) => {
    if (draftTouched) return limitsDraft[key] ?? "";
    const v = limits?.[key];
    return v == null ? "" : String(v);
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center justify-between gap-3 text-sm rounded-xl px-4 py-3 border ${
            notice.kind === "error"
              ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20"
              : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.kind === "error" ? <X size={14} /> : <Check size={14} />}
            {notice.text}
          </span>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Feature toggles */}
      <div>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Module Access</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Toggle which ERP modules this company can use. Changes apply immediately.
            </p>
          </div>
          <button
            onClick={handleReset}
            disabled={resetFeatures.isPending}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RotateCcw size={13} className={resetFeatures.isPending ? "animate-spin" : ""} />
            Reset to defaults
          </button>
        </div>
        {featuresLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {features?.map((f) => (
              <div key={f.key} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-surface/40 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{f.name}</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface text-muted uppercase tracking-wide">
                      {f.module}
                    </span>
                    {f.overridden && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wide">
                        Overridden
                      </span>
                    )}
                  </div>
                  {f.description && <p className="text-[11px] text-muted mt-0.5">{f.description}</p>}
                </div>
                <Toggle
                  checked={enabledMap[f.key] ?? false}
                  label={`${f.name} module`}
                  disabled={setFeatures.isPending}
                  onChange={(v) => handleToggle(f.key, v)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage limits */}
      <form onSubmit={handleSaveLimits}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Usage Limits</h2>
          <p className="text-[11px] text-muted mt-0.5">Quotas enforced across the company. Leave blank for unlimited.</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LIMIT_FIELDS.map(({ key, label, hint, placeholder }) => (
            <Field key={key} label={label} hint={hint}>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={placeholder}
                value={limitValue(key)}
                disabled={limitsLoading || setLimits.isPending}
                onChange={(e) => {
                  setDraftTouched(true);
                  setLimitsDraft((prev) => ({ ...prev, [key]: e.target.value }));
                }}
              />
            </Field>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setDraftTouched(false);
              setLimitsDraft({});
            }}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-muted hover:text-foreground transition-colors"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={limitsLoading || setLimits.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[13px] font-bold transition-colors disabled:opacity-50"
          >
            {setLimits.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save limits
          </button>
        </div>
      </form>
    </div>
  );
}
