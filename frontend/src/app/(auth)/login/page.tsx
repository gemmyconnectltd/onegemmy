"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2b2118] via-[#3d2f22] to-primary p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Layers className="text-foreground" size={20} />
            </div>
            <span className="text-xl font-bold text-white">OneGemmy</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Run Your Business
            <br />
            <span className="text-white/70">From One Place</span>
          </h1>
          <p className="text-lg text-white/60 max-w-md">
            All-in-one platform for sales, inventory, finance, HR, projects, and CRM.
          </p>
        </div>
        <div className="text-white/40 text-sm">
          &copy; {new Date().getFullYear()} Gemmy Connect Ltd. All rights reserved.
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
              <Layers className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold text-foreground">OneGemmy</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-8">Enter your credentials to access your account</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 mb-6 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-3 py-2.5 pr-10 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-foreground/70">
                <input type="checkbox" className="accent-primary" />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 p-4 bg-surface border border-border">
            <p className="text-xs text-muted text-center mb-3 font-medium">Quick Login - Click to sign in</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Owner", email: "admin@onegemmy.com", password: "admin123" },
                { label: "Manager", email: "manager@onegemmy.com", password: "manager123" },
                { label: "Sales", email: "sales@onegemmy.com", password: "sales123" },
              ].map((demo) => (
                <button
                  key={demo.label}
                  type="button"
                  onClick={async () => {
                    setEmail(demo.email);
                    setPassword(demo.password);
                    setLoading(true);
                    const success = await login(demo.email, demo.password);
                    if (success) router.push("/dashboard");
                    setLoading(false);
                  }}
                  className="bg-white border border-border p-3 rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer group"
                >
                  <p className="text-xs font-bold text-foreground group-hover:text-primary">{demo.label}</p>
                  <p className="text-[10px] text-muted mt-1 truncate">{demo.email}</p>
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted text-center mt-8">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Contact sales
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
