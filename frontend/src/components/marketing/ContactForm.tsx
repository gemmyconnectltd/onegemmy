"use client";

import { useState } from "react";
import { Loader2, ArrowRight, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Same option sets as the registration form, so a lead's answers here line
// up with the fields they'd fill in when they actually sign up.
const INDUSTRIES = ["Retail", "Wholesale", "Manufacturing", "Services", "Hospitality", "Technology", "Agriculture", "Construction", "Healthcare", "Education", "Other"];
const EMPLOYEE_COUNTS = ["Just me", "2-5", "6-10", "11-50", "51-200", "200+"];
const INQUIRY_TYPES = ["Request a demo", "Pricing information", "Technical support", "Partnership", "General inquiry"];

const inputClass =
  "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground placeholder:text-muted/60 bg-surface/30 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5 outline-none transition-all";

const selectClass = `${inputClass} appearance-none cursor-pointer pr-8`;

function Select({
  label, value, onChange, options, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-foreground mb-1.5">{label}</label>
      <div className="relative">
        <select
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={selectClass}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      </div>
    </div>
  );
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [inquiryType, setInquiryType] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/global/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          phone: phone || undefined,
          industry: industry || undefined,
          employee_count: employeeCount || undefined,
          inquiry_type: inquiryType || undefined,
          message,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = Array.isArray(json?.detail)
          ? json.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(" ")
          : json?.detail || json?.message;
        throw new Error(detail || "Something went wrong. Please try again.");
      }
      setStatus("success");
      setName(""); setEmail(""); setCompany(""); setPhone("");
      setIndustry(""); setEmployeeCount(""); setInquiryType(""); setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#16a34a]/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={24} className="text-[#16a34a]" />
        </div>
        <h3 className="font-bold text-foreground mb-1.5">Message sent</h3>
        <p className="text-sm text-muted mb-5">
          Thanks for reaching out — our team will get back to you shortly.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-sm font-semibold text-[#16a34a] hover:underline"
        >
          Send another inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 text-left space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Full name</label>
          <input
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Work email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Business name</label>
          <input
            type="text"
            required
            maxLength={200}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Your business"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Phone number (optional)</label>
          <input
            type="tel"
            maxLength={40}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+250 7xx xxx xxx"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Select label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} placeholder="Select industry" />
        <Select label="Business size" value={employeeCount} onChange={setEmployeeCount} options={EMPLOYEE_COUNTS} placeholder="Select team size" />
      </div>

      <Select label="What can we help with?" value={inquiryType} onChange={setInquiryType} options={INQUIRY_TYPES} placeholder="Select an option" required />

      <div>
        <label className="block text-[13px] font-medium text-foreground mb-1.5">Message</label>
        <textarea
          required
          maxLength={5000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your business and what you're looking for"
          className={`${inputClass} resize-none`}
        />
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-[#16a34a] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#15803d] transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Send Message
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </form>
  );
}
