"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { usePageTitle } from "@/lib/pageTitles";

export default function ForgotPasswordPage() {
  usePageTitle("Forgot Password");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // TODO: wire up to backend password reset endpoint when available
    await new Promise((r) => setTimeout(r, 1000));
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-card">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
            <Layers className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold text-foreground">OneGemmy</span>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} className="text-green-500" />
            </div>
            <h1 className="text-[22px] font-bold text-foreground mb-2">Check your email</h1>
            <p className="text-sm text-muted mb-6">
              If <span className="font-medium text-foreground">{email}</span> is registered, you&apos;ll receive a reset link shortly.
            </p>
            <Link href="/login" className="text-sm font-medium text-foreground hover:underline flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-[26px] font-bold text-foreground tracking-tight">Forgot password?</h1>
              <p className="text-sm text-muted mt-1.5">Enter your email and we&apos;ll send you a reset link.</p>
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
                  placeholder="you@company.com"
                  required
                  className="w-full px-3.5 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 bg-surface/30 outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#6f1a07] text-white py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Sending...</>
                ) : (
                  <>Send reset link <ArrowRight size={16} /></>
                )}
              </button>
            </form>

            <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1.5 mt-6">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
