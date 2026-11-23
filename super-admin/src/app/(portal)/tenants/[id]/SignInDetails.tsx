"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/lib/config";

/** A random 10-character password that is easy to read out (no 0/O, 1/l/I). */
export function makePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => chars[b % chars.length]).join("");
}

/** A password chosen for someone else: at least 6 characters, no spaces at either end (the server checks the same). */
export const passwordProblem = (p: string) => !p ? null : p.length < 6 ? "The password must be at least 6 characters" : p !== p.trim() ? "The password can't start or end with a space" : null;

/** The person's email and password, shown once after they are set, to copy or read out. */
export function SignInDetails({ email, password, emailed }: { email: string; password: string; emailed: boolean | null }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${siteConfig.appUrl}/login`;
  const copy = () => { void navigator.clipboard?.writeText(`Email: ${email}\nPassword: ${password}\nSign in: ${loginUrl}`).then(() => setCopied(true)).catch(() => setCopied(false)); };
  return (
    <div className="space-y-3">
      <p className="text-sm">{emailed === null ? "Give these details to them directly." : emailed ? "These were also emailed to them." : "The email could not be sent. Give these details to them directly."}</p>
      <dl className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Email</dt><dd className="mt-0.5 break-all text-sm font-semibold">{email}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Password</dt><dd className="mt-0.5 break-all font-mono text-base font-semibold">{password}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sign in at</dt><dd className="mt-0.5 break-all text-sm">{loginUrl}</dd></div>
      </dl>
      <p className="text-xs text-muted">This is the only time the password is shown.</p>
      <Button type="button" onClick={copy}>{copied ? "Copied" : "Copy details"}</Button>
    </div>
  );
}
