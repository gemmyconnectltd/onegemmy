"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { usePageTitle } from "@/lib/pageTitles";
import { Logo } from "@/components/ui/Logo";
import { authApi } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  usePageTitle("Forgot Password");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [devDelivered, setDevDelivered] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // The backend always responds with the same message whether or not
      // the email exists, so it can't be used to probe for registered
      // accounts — we just show the "check your email" state either way.
      const res = await authApi.forgotPassword(email);
      // In local/staging the backend returns a debug reset link so the flow
      // stays testable even when SMTP is unconfigured. Production never
      // returns it, so this stays dev-only.
      const data = res?.data as { debug_reset_link?: string; debug_email_delivered?: boolean } | undefined;
      if (data?.debug_reset_link) {
        setDevLink(data.debug_reset_link);
        setDevDelivered(data.debug_email_delivered ?? false);
      }
      setSent(true);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const detail = (err as { detail?: string })?.detail;
      if (!status) {
        setError("Can't reach the server. Check your connection and try again in a moment.");
      } else if (status === 429) {
        setError("Too many reset requests. Please wait a while before trying again.");
      } else {
        setError(detail || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-card">
      <div className="w-full max-w-[380px]">
        <div className="mb-10">
          <Logo size="md" />
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
            {devLink && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-left">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Dev only</p>
                {!devDelivered && (
                  <p className="text-[12px] text-amber-700 mb-2">
                    Email delivery isn&apos;t configured — use the link below directly.
                  </p>
                )}
                <a href={devLink} className="text-[12px] font-medium text-amber-800 break-all hover:underline">
                  {devLink}
                </a>
              </div>
            )}
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
                  className="w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground placeholder:text-muted/60 bg-surface/30 outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
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
