"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { usePageTitle } from "@/lib/pageTitles";
import { Logo } from "@/components/ui/Logo";
import { authApi } from "@/lib/api/auth";

const inputClass =
  "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground placeholder:text-muted/60 bg-surface/30 outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5 transition-all";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const passwordChecks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Passwords match", met: password.length > 0 && password === confirmPassword },
  ];
  const passwordValid = passwordChecks.every((c) => c.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setError("Please meet all password requirements below");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const detail = (err as { detail?: string })?.detail;
      if (!status) {
        setError("Can't reach the server. Check your connection and try again in a moment.");
      } else if (status === 401) {
        setError("This reset link is invalid or has expired. Request a new one.");
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

        {!token ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={28} className="text-red-500" />
            </div>
            <h1 className="text-[22px] font-bold text-foreground mb-2">Invalid reset link</h1>
            <p className="text-sm text-muted mb-6">
              This link is missing its reset token. Request a new password reset link and use the one from that email.
            </p>
            <Link href="/forgot-password" className="text-sm font-medium text-foreground hover:underline flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back to forgot password
            </Link>
          </div>
        ) : done ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} className="text-green-500" />
            </div>
            <h1 className="text-[22px] font-bold text-foreground mb-2">Password reset</h1>
            <p className="text-sm text-muted mb-6">Your password has been changed. Sign in with your new password.</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all flex items-center justify-center gap-2"
            >
              Go to sign in <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-[26px] font-bold text-foreground tracking-tight">Set a new password</h1>
              <p className="text-sm text-muted mt-1.5">Choose a new password for your account.</p>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 mb-6 text-sm rounded-lg">
                <AlertCircle size={16} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    required
                    minLength={8}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Confirm new password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  className={inputClass}
                />
                {(password.length > 0 || confirmPassword.length > 0) && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5">
                    {passwordChecks.map((check) => (
                      <div key={check.label} className={`text-[11px] flex items-center gap-1.5 ${check.met ? "text-emerald-600" : "text-muted/60"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${check.met ? "bg-emerald-600" : "bg-muted/30"}`} />
                        {check.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Resetting...</>
                ) : (
                  <>Reset password <ArrowRight size={16} /></>
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

export default function ResetPasswordPage() {
  usePageTitle("Reset Password");
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
