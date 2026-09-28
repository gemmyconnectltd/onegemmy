"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import worldCountriesData from "world-countries";
import {
  AlertCircle, ArrowRight, ArrowLeft, Loader2, Check, Eye, EyeOff, MapPin, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/pageTitles";
import { Logo } from "@/components/ui/Logo";
import { AuthBrandingPanel } from "@/components/auth/AuthBrandingPanel";

const TOTAL_STEPS = 2;

// ── Personal-info step reference data (still UI-only — see handleSubmit) ──
// Full ISO country list (name, flag, dial code) from the `world-countries`
// package — a static, offline dataset rather than a live API call, since a
// signup form shouldn't depend on a third-party API's uptime just to render
// a dropdown. `currency` is only set when the country's real currency (per
// that same dataset) is one this platform actually supports end-to-end
// (matches /global/currencies) — everyone else just shows no currency badge
// rather than a guessed/wrong one.
const SUPPORTED_CURRENCIES = new Set(["RWF", "USD", "EUR", "KES", "UGX", "TZS"]);

function countryDialCode(idd?: { root?: string; suffixes?: string[] }): string {
  if (!idd?.root) return "";
  // Countries sharing one calling code (e.g. the US/Canada/Caribbean under
  // NANP's "+1") have many suffixes for area codes — the country code alone
  // is what a phone-number-country selector actually needs there.
  if (!idd.suffixes || idd.suffixes.length !== 1) return idd.root;
  return `${idd.root}${idd.suffixes[0]}`;
}

const COUNTRIES = worldCountriesData
  .map((c) => ({
    name: c.name.common,
    flag: c.flag,
    dial: countryDialCode(c.idd),
    currency: Object.keys(c.currencies ?? {}).find((code) => SUPPORTED_CURRENCIES.has(code)),
  }))
  .filter((c) => c.dial)
  .sort((a, b) => a.name.localeCompare(b.name));

const BUSINESS_TYPES = [
  { value: "sole", label: "Sole Proprietorship", desc: "Individual-owned business" },
  { value: "partnership", label: "Partnership", desc: "Two or more owners" },
  { value: "llc", label: "Limited Liability (LLC)", desc: "Registered limited company" },
  { value: "unregistered", label: "Not Registered", desc: "Informal / unregistered" },
];

const INDUSTRIES = ["Retail", "Wholesale", "Manufacturing", "Services", "Hospitality", "Technology", "Agriculture", "Construction", "Healthcare", "Education", "Other"];
const BUSINESS_CATEGORIES = ["Product-based", "Service-based", "Mixed (Products & Services)"];
const EMPLOYEE_COUNTS = ["Just me", "2-5", "6-10", "11-50", "51-200", "200+"];
const HEARD_ABOUT = ["Social media", "Friend or colleague", "Search engine", "Advertisement", "Other"];

const inputClass = (focused: boolean) =>
  `w-full px-3.5 py-2.5 border rounded-lg text-sm text-foreground placeholder:text-muted/60 bg-surface/30 transition-all outline-none ${
    focused ? "border-foreground/30 ring-2 ring-foreground/5" : "border-border"
  }`;

const selectClass = "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground bg-surface/30 transition-all outline-none appearance-none cursor-pointer";

export default function RegisterPage() {
  usePageTitle("Create Account");
  const router = useRouter();
  const { register } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1 — Personal information
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryName, setCountryName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2 — Business information
  const [company, setCompany] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [businessLocation, setBusinessLocation] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [hasMultipleBranches, setHasMultipleBranches] = useState(false);
  const [mainBranchName, setMainBranchName] = useState("");

  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handlePhoneChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9\s\-]/g, "");
    setPhone(cleaned);
    const digits = cleaned.replace(/\D/g, "");
    if (cleaned.length === 0) { setPhoneError(""); return; }
    if (digits.length < 6)  { setPhoneError("Too short — minimum 6 digits"); return; }
    if (digits.length > 15) { setPhoneError("Too long — maximum 15 digits"); return; }
    setPhoneError("");
  };

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 6 && phoneDigits.length <= 15;

  // Name validation — letters, spaces, hyphens, apostrophes only
  const nameValid = (v: string) => v.trim().length >= 2 && /^[\p{L}\s'\-]+$/u.test(v.trim());
  const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const companyValid = (v: string) => v.trim().length >= 2;
  const locationValid = (v: string) => v.trim().length >= 3;
  const referralValid = (v: string) => v === "" || /^[A-Za-z0-9\-_]{3,20}$/.test(v);

  // Best-effort: default Country (and, since they share `countryName`, the
  // phone country-code) to wherever the visitor actually is, via IP
  // geolocation. Never blocks or errors the form — a slow/failed/unmatched
  // lookup just leaves the field for them to pick manually, same as today.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    fetch("https://ipwho.is/", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { success?: boolean; country?: string }) => {
        if (!data.success || !data.country) return;
        const match = COUNTRIES.find((c) => c.name === data.country);
        if (match) setCountryName((current) => current || match.name);
      })
      .catch(() => {
        // Geolocation lookup failed/timed out — leave it to manual selection.
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const selectedCountry = COUNTRIES.find((c) => c.name === countryName);

  const passwordChecks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Passwords match", met: password.length > 0 && password === confirmPassword },
  ];
  const passwordValid = passwordChecks.every((c) => c.met);

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid(firstName)) { setError("First name must be at least 2 letters (no numbers or symbols)"); return; }
    if (!nameValid(lastName))  { setError("Last name must be at least 2 letters (no numbers or symbols)"); return; }
    if (!emailValid(email))    { setError("Please enter a valid email address"); return; }
    if (!countryName)          { setError("Please select your country"); return; }
    if (!phone)                { setError("Please enter your phone number"); return; }
    if (!phoneValid)           { setError(phoneError || "Please enter a valid phone number"); return; }
    if (!passwordValid)        { setError("Please meet all password requirements below"); return; }
    setError("");
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!businessType)              { setError("Please select a business type"); return; }
    if (!companyValid(company))     { setError("Business name must be at least 2 characters"); return; }
    if (!locationValid(businessLocation)) { setError("Please enter a valid business location (min 3 characters)"); return; }
    if (!referralValid(referralCode))     { setError("Referral code must be 3–20 alphanumeric characters"); return; }
    setLoading(true);
    // Personal-info step's gender is still UI-only — it belongs to the
    // person, not the business, and isn't persisted anywhere yet. Phone and
    // country map to the business's own phone/country columns on Tenant
    // (see backend Tenant model + auth.service.register).
    const dialCode = selectedCountry?.dial ?? "";
    const result = await register({
      fullName: `${firstName} ${lastName}`.trim(),
      email,
      password,
      tenantName: company,
      tenantSlug: company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      country: countryName || undefined,
      phone: phone ? `${dialCode} ${phone}`.trim() : undefined,
      businessType: businessType || undefined,
      industry: industry || undefined,
      businessCategory: businessCategory || undefined,
      employeeCount: employeeCount || undefined,
      businessLocation: businessLocation || undefined,
      heardAbout: heardAbout || undefined,
      referralCode: referralCode || undefined,
      mainBranchName: hasMultipleBranches && mainBranchName ? mainBranchName : undefined,
    });
    if (result.ok) {
      if (result.pending) {
        setPending(true);
      } else {
        router.push("/dashboard");
      }
    } else {
      setError(result.error ?? "Registration failed. Please try again.");
    }
    setLoading(false);
  };

  const progressPct = pending ? 100 : Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen flex">
      <AuthBrandingPanel />

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-card overflow-y-auto">
        <div className="w-full max-w-105">
          <div className="lg:hidden mb-10">
            <Logo size="md" />
          </div>

          {pending ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                <Check size={26} className="text-emerald-500" />
              </div>
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">Registration received</h1>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                Thanks for signing up <strong className="text-foreground">{company}</strong>! Your account is
                pending approval — we&apos;ll email <strong className="text-foreground">{email}</strong> once it&apos;s
                activated. You can then sign in with the password you just created.
              </p>
              <Link href="/login" className="inline-block mt-6 text-sm text-foreground font-medium hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
          <>
          {/* Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-2">
              <span>Step {step} of {TOTAL_STEPS}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="mb-6">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-3 -ml-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <h1 className="text-[26px] font-bold text-foreground tracking-tight">
              {step === 1 ? "Personal information" : "Business information"}
            </h1>
            <p className="text-sm text-muted mt-1.5">
              {step === 1 ? "Let's create your account." : "Tell us about your business."}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 mb-6 text-sm rounded-lg">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={goToStep2} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">First Name *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onFocus={() => setFocusedField("firstName")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="John"
                    required
                    autoFocus
                    className={`${inputClass(focusedField === "firstName")} ${firstName && !nameValid(firstName) ? "!border-red-400" : firstName && nameValid(firstName) ? "!border-emerald-500" : ""}`}
                  />
                  {firstName && !nameValid(firstName) && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Letters only, min 2 chars</p>
                  )}
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Last Name *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onFocus={() => setFocusedField("lastName")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Doe"
                    required
                    className={`${inputClass(focusedField === "lastName")} ${lastName && !nameValid(lastName) ? "!border-red-400" : lastName && nameValid(lastName) ? "!border-emerald-500" : ""}`}
                  />
                  {lastName && !nameValid(lastName) && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Letters only, min 2 chars</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Phone Number *</label>
                <div className="flex gap-2">
                  <div className="relative w-27.5 shrink-0">
                    <select
                      value={countryName}
                      onChange={(e) => setCountryName(e.target.value)}
                      required
                      className={`${selectClass} pr-7`}
                    >
                      <option value="">Code</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.name} value={c.name}>{c.flag} {c.dial}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="712 123 456"
                    required
                    inputMode="numeric"
                    className={`${inputClass(focusedField === "phone")} ${phoneError ? "!border-red-400" : phone && phoneValid ? "!border-emerald-500" : ""}`}
                  />
                </div>
                {phoneError && (
                  <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={11} className="shrink-0" /> {phoneError}
                  </p>
                )}
                {!phoneError && phone && phoneValid && (
                  <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1">
                    <Check size={11} className="shrink-0" /> Valid phone number
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@company.com"
                  required
                  className={`${inputClass(focusedField === "email")} ${email && !emailValid(email) ? "!border-red-400" : email && emailValid(email) ? "!border-emerald-500" : ""}`}
                />
                {email && !emailValid(email) && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Enter a valid email address</p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Country *</label>
                <div className="relative">
                  <select
                    value={countryName}
                    onChange={(e) => setCountryName(e.target.value)}
                    required
                    className={`${selectClass} pr-8`}
                  >
                    <option value="">Select your country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>
                {selectedCountry?.currency && (
                  <p className="text-xs text-muted mt-2">
                    Detected currency: <span className="font-mono font-semibold text-foreground bg-surface border border-border rounded px-1.5 py-0.5 ml-1">{selectedCountry.currency}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Password *</label>
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
                    className={`${inputClass(focusedField === "password")} pr-10`}
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

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField("confirmPassword")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Confirm your password"
                    required
                    className={`${inputClass(focusedField === "confirmPassword")} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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
                className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all flex items-center justify-center gap-2 mt-2"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">What is the name of your business? *</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onFocus={() => setFocusedField("company")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Acme Corp"
                  required
                  autoFocus
                  className={`${inputClass(focusedField === "company")} ${company && !companyValid(company) ? "!border-red-400" : company && companyValid(company) ? "!border-emerald-500" : ""}`}
                />
                {company && !companyValid(company) && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Business name must be at least 2 characters</p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-2">Business Type *</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setBusinessType(bt.value)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        businessType === bt.value ? "border-accent bg-accent/5" : "border-border hover:border-foreground/20"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${businessType === bt.value ? "border-accent bg-accent" : "border-muted/40"}`} />
                        <span className="text-[12.5px] font-semibold text-foreground">{bt.label}</span>
                      </div>
                      <p className="text-[11px] text-muted pl-4.5">{bt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Industry *</label>
                  <div className="relative">
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)} required className={`${selectClass} pr-8`}>
                      <option value="">Select</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Business Category *</label>
                  <div className="relative">
                    <select value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)} required className={`${selectClass} pr-8`}>
                      <option value="">Select</option>
                      {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Number of Employees *</label>
                <div className="relative">
                  <select value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} required className={`${selectClass} pr-8`}>
                    <option value="">Select number of employees</option>
                    {EMPLOYEE_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Business Location *</label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={businessLocation}
                    onChange={(e) => setBusinessLocation(e.target.value)}
                    onFocus={() => setFocusedField("location")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. Kigali, Rwanda"
                    required
                    className={`${inputClass(focusedField === "location")} pl-10 ${businessLocation && !locationValid(businessLocation) ? "!border-red-400" : businessLocation && locationValid(businessLocation) ? "!border-emerald-500" : ""}`}
                  />
                </div>
                {businessLocation && !locationValid(businessLocation) && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Please enter a valid location (min 3 characters)</p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-2">Does your business have multiple branches?</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([{ value: true, label: "Yes" }, { value: false, label: "No" }] as const).map(({ value, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setHasMultipleBranches(value); if (!value) setMainBranchName(""); }}
                      className={`py-2.5 rounded-lg border text-[13px] font-semibold transition-colors ${
                        hasMultipleBranches === value ? "border-accent bg-accent/5 text-accent" : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {hasMultipleBranches && (
                  <div className="mt-3">
                    <label className="block text-[13px] font-medium text-foreground mb-1.5">Name your main branch</label>
                    <input
                      type="text"
                      value={mainBranchName}
                      onChange={(e) => setMainBranchName(e.target.value)}
                      onFocus={() => setFocusedField("mainBranch")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g. Kigali HQ, Main Store"
                      className={inputClass(focusedField === "mainBranch")}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">How did you hear about us?</label>
                <div className="relative">
                  <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} className={`${selectClass} pr-8`}>
                    <option value="">Select</option>
                    {HEARD_ABOUT.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>
              </div>

              {showReferral ? (
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Referral Code</label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.replace(/[^A-Za-z0-9\-_]/g, ""))}
                    onFocus={() => setFocusedField("referral")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. FRIEND2024"
                    maxLength={20}
                    className={`${inputClass(focusedField === "referral")} ${referralCode && !referralValid(referralCode) ? "!border-red-400" : referralCode && referralValid(referralCode) ? "!border-emerald-500" : ""}`}
                  />
                  {referralCode && !referralValid(referralCode) && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> 3–20 letters, numbers, hyphens or underscores only</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReferral(true)}
                  className="text-[13px] font-medium text-accent hover:underline"
                >
                  + Have a referral code?
                </button>
              )}

              <label className="flex items-start gap-2 text-sm text-foreground/60 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent rounded mt-0.5"
                  required
                />
                <span>I agree to the <Link href="/terms" className="text-foreground font-medium hover:underline">Terms</Link> and <Link href="/privacy" className="text-foreground font-medium hover:underline">Privacy Policy</Link></span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
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
          )}

          <p className="text-sm text-muted text-center mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
