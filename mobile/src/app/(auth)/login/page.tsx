"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff, Loader2, Smartphone, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  { label: "FreshMart Admin", email: "admin@freshmart.rw", password: "admin123", slug: "freshmart" },
  { label: "FreshMart Sales", email: "sales.manager@freshmart.rw", password: "user123", slug: "freshmart" },
  { label: "OneGemmy Admin", email: "admin@onegemmy.com", password: "admin123", slug: "onegemmy" },
  { label: "OneGemmy Sales", email: "sales.manager@onegemmy.com", password: "user123", slug: "onegemmy" },
] as const;

export default function MobileLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState<string | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const result = await login(email, password, tenantSlug);
    if (result.ok) {
      router.replace("/");
    } else {
      setError(result.error ?? "Invalid email or password");
    }
    setLoading(false);
  };

  const fillDemo = (demo: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setTenantSlug(demo.slug);
    setError(null);
  };

  return (
    <div className="min-h-full flex flex-col bg-surface">
      <div className="flex-1 flex flex-col justify-center px-6 py-10">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">OneGemmy</h1>
            <p className="text-[11px] text-muted">Mobile Point of Sale</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-muted">Email</label>
            <input
              type="email"
              required
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="w-full px-3.5 py-3 rounded-xl bg-card border border-border text-[14px] text-foreground placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-muted">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-3 rounded-xl bg-card border border-border text-[14px] text-foreground placeholder:text-muted/40 outline-none focus:border-accent transition-colors pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-accent text-white font-bold text-[15px] hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Demo accounts — development only */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-6">
            <button
              onClick={() => setShowDemo((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border text-foreground/70 active:bg-surface transition-colors"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Sparkles size={13} className="text-accent" /> Use demo account
              </span>
              <ChevronDown size={14} className={`text-muted transition-transform ${showDemo ? "rotate-180" : ""}`} />
            </button>
            {showDemo && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    onClick={() => fillDemo(demo)}
                    className="text-left px-3 py-2.5 rounded-xl bg-card border border-border hover:border-accent/50 transition-colors"
                  >
                    <p className="text-[12px] font-semibold text-foreground">{demo.label}</p>
                    <p className="text-[10px] text-muted mt-0.5 truncate">{demo.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-muted pb-[env(safe-area-inset-bottom)] py-4">
        OneGemmy · Gemmy Connect Ltd
      </p>
    </div>
  );
}
