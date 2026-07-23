"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Eye, EyeOff, AlertCircle, ArrowRight, Loader2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const success = await register(name, email, password, company);
    if (success) {
      router.push("/dashboard");
    } else {
      setError("Email already registered");
    }
    setLoading(false);
  };

  const passwordChecks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
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
              Start Managing
              <br />
              <span className="text-white/50">Your Business Today</span>
            </h1>
            <p className="text-base text-white/40 max-w-sm leading-relaxed">
              Free for small teams. Set up in 30 minutes. No credit card required.
            </p>
          </div>

          <div className="space-y-3 mt-12">
            {["All-in-one business platform", "Real-time analytics & reports", "Role-based access control"].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center">
                  <Check size={12} className="text-white/70" />
                </div>
                <span className="text-sm text-white/40">{item}</span>
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
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
              <Layers className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold text-foreground">OneGemmy</span>
          </div>

          <div className="mb-8">
            <h1 className="text-[26px] font-bold text-foreground tracking-tight">Create your account</h1>
            <p className="text-sm text-muted mt-1.5">Get started with OneGemmy for free</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 mb-6 text-sm rounded-lg">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocusedField("name")}
                onBlur={() => setFocusedField(null)}
                placeholder="John Doe"
                required
                className={`w-full px-3.5 py-2.5 border text-sm text-foreground placeholder:text-muted/60 bg-surface/30 transition-all outline-none ${
                  focusedField === "name" ? "border-foreground/30 ring-2 ring-foreground/5" : "border-border"
                }`}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                onFocus={() => setFocusedField("company")}
                onBlur={() => setFocusedField(null)}
                placeholder="Acme Corp"
                required
                className={`w-full px-3.5 py-2.5 border text-sm text-foreground placeholder:text-muted/60 bg-surface/30 transition-all outline-none ${
                  focusedField === "company" ? "border-foreground/30 ring-2 ring-foreground/5" : "border-border"
                }`}
              />
            </div>
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
                  placeholder="Create a strong password"
                  required
                  minLength={8}
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
              {password.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {passwordChecks.map((check) => (
                    <div key={check.label} className={`text-[10px] flex items-center gap-1 ${check.met ? "text-emerald-600" : "text-muted/50"}`}>
                      <div className={`w-1 h-1 rounded-full ${check.met ? "bg-emerald-600" : "bg-muted/30"}`} />
                      {check.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm text-foreground/60 cursor-pointer pt-1">
              <input type="checkbox" className="w-3.5 h-3.5 accent-[#6f1a07] rounded mt-0.5" required />
              <span>I agree to the <Link href="/terms" className="text-foreground font-medium hover:underline">Terms</Link> and <Link href="/privacy" className="text-foreground font-medium hover:underline">Privacy Policy</Link></span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6f1a07] text-white py-2.5 text-sm font-medium hover:bg-[#5a1506] active:bg-[#4a1205] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-muted text-center mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
