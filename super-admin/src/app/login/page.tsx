"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";

const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted/60 bg-surface/30 outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5";

export default function LoginPage() {
  const { user, isLoading, isSuperAdmin, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && user && isSuperAdmin()) router.replace("/");
  }, [isLoading, user, isSuperAdmin, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const res = await login(email.trim(), password, remember);
    setBusy(false);
    if (res.ok) router.replace("/");
    else setError(res.error ?? "Sign in failed.");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center"><LogoMark size={20} className="text-white" strokeWidth={2.5} /></div>
          <span className="text-lg font-bold text-foreground">{siteConfig.name} Admin</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Platform sign in</h1>
          </div>
          <p className="text-sm text-muted mb-6">For Pesaa platform administrators only.</p>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-600 px-3.5 py-3 mb-5 text-sm rounded-lg">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-foreground mb-1.5">Email</label>
              <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@pesaa.io" />
            </div>
            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-10`} placeholder="Enter your password" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-1">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground/80 select-none">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
              Keep me signed in on this device
            </label>
            <button type="submit" disabled={busy || !email || !password} className="w-full flex items-center justify-center gap-2 bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <>Sign in <ArrowRight size={15} /></>}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted mt-6">
          Looking for your business account? <a href={`${siteConfig.appUrl}/login`} className="font-medium text-foreground hover:underline">Sign in to the Pesaa app</a>
        </p>
      </div>
    </main>
  );
}
