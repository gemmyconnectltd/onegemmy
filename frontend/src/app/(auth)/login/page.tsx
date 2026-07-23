"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const success = await login(email, password);
    if (success) {
      router.push("/dashboard");
    } else {
      setError("Invalid email or password");
    }
    setLoading(false);
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setError("");
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    const success = await login(demoEmail, demoPassword);
    if (success) router.push("/dashboard");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        {/* Glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-[100px]" />

        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <div>
            <div className="flex items-center gap-2.5 mb-16">
              <div className="w-10 h-10 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl flex items-center justify-center">
                <Layers className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold text-white">OneGemmy</span>
            </div>

            <h1 className="text-[40px] font-bold text-white mb-4 leading-[1.15]">
              Run Your Business
              <br />
              <span className="text-white/50">From One Place</span>
            </h1>
            <p className="text-base text-white/40 max-w-sm leading-relaxed">
              Sales, inventory, finance, HR, projects, and CRM — everything you need in a single platform.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-12">
            {[
              { value: "10K+", label: "Businesses" },
              { value: "99.9%", label: "Uptime" },
              { value: "24/7", label: "Support" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/30">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="text-white/20 text-xs mt-12">
            &copy; {new Date().getFullYear()} Gemmy Connect Ltd. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
              <Layers className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold text-foreground">OneGemmy</span>
          </div>

          <div className="mb-8">
            <h1 className="text-[26px] font-bold text-foreground tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted mt-1.5">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 mb-6 text-sm rounded-lg">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@company.com"
                required
                className={`w-full px-3.5 py-2.5 border text-sm text-foreground placeholder:text-muted/60 bg-surface/30 transition-all outline-none ${
                  focusedField === "email" ? "border-foreground/30 ring-2 ring-foreground/5" : "border-border"
                }`}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  required
                  className={`w-full px-3.5 py-2.5 pr-10 border text-sm text-foreground placeholder:text-muted/60 bg-surface/30 transition-all outline-none ${
                    focusedField === "password" ? "border-foreground/30 ring-2 ring-foreground/5" : "border-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 text-sm text-foreground/60 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 accent-[#6f1a07] rounded" />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm text-foreground/50 hover:text-foreground transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6f1a07] text-white py-2.5 text-sm font-medium hover:bg-[#5a1506] active:bg-[#4a1205] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-muted">Quick login</span>
            </div>
          </div>

          {/* Demo accounts */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Owner", email: "admin@onegemmy.com", password: "admin123", role: "Full access" },
              { label: "Manager", email: "manager@onegemmy.com", password: "manager123", role: "Team lead" },
              { label: "Sales", email: "sales@onegemmy.com", password: "sales123", role: "Sales rep" },
            ].map((demo) => (
              <button
                key={demo.label}
                type="button"
                disabled={loading}
                onClick={() => {
                  setEmail(demo.email);
                  setPassword(demo.password);
                }}
                className="border border-border p-3 hover:border-foreground/20 hover:bg-surface/50 transition-all text-left cursor-pointer group disabled:opacity-50"
              >
                <p className="text-xs font-semibold text-foreground group-hover:text-[#6f1a07] transition-colors">{demo.label}</p>
                <p className="text-[10px] text-muted/70 mt-1">{demo.role}</p>
              </button>
            ))}
          </div>

          <p className="text-sm text-muted text-center mt-8">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-foreground font-medium hover:underline">
              Contact sales
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
