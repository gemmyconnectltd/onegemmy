"use client";

import { useState } from "react";
import { ChevronDown, LifeBuoy, Mail, Phone, Send } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";

const FAQS = [
  {
    q: "How do I make a sale?",
    a: "Tap Sell on the bottom navigation, add items to the cart, then open the cart and tap Continue to payment. Choose a payment method and press Charge — the receipt is generated automatically.",
  },
  {
    q: "How do I add a product?",
    a: "From the Home screen open Products and tap Add a product. Fill in the name, price and stock, then save. The product appears in your POS instantly.",
  },
  {
    q: "How do I receive stock?",
    a: "Open Inventory and tap Receive stock. Choose the product, enter the quantity, and save. Stock levels update right away.",
  },
  {
    q: "How do I print a receipt?",
    a: "After a sale, the receipt screen has a Print button. You can set paper size and copies in Account → Printer settings.",
  },
  {
    q: "How do I issue an invoice?",
    a: "During checkout choose Invoice as the payment method and select a customer. The receipt becomes an invoice with a due amount.",
  },
  {
    q: "How do I back up my data?",
    a: "Open Account and tap Backup data to export your sales and purchases as a JSON file you can store safely.",
  },
];

export default function MobileSupportPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Help & support" subtitle="How can we help?" />

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Contact card */}
        <div className="bg-accent text-white rounded-2xl p-4 shadow-lg shadow-accent/25">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
              <LifeBuoy size={17} />
            </div>
            <div>
              <p className="text-[13px] font-bold">OneGemmy support team</p>
              <p className="text-[10px] text-white/75">We usually reply within 24 hours</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="mailto:support@onegemmy.com"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-accent text-[12px] font-bold active:scale-[0.98] transition"
            >
              <Mail size={14} /> Email us
            </a>
            <a
              href="tel:+250700000000"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/15 border border-white/20 text-white text-[12px] font-bold active:scale-[0.98] transition"
            >
              <Phone size={14} /> Call us
            </a>
          </div>
        </div>

        {/* Report a problem */}
        <a
          href={`mailto:support@onegemmy.com?subject=${encodeURIComponent("Report a problem — OneGemmy mobile")}&body=${encodeURIComponent("Hi OneGemmy support,\n\nI ran into an issue:\n\n[describe what happened]\n\nThanks!")}`}
          className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 active:bg-surface transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0">
            <Send size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Report a problem</p>
            <p className="text-[10px] text-muted mt-0.5">Tell us what went wrong</p>
          </div>
          <ChevronDown size={15} className="text-muted flex-shrink-0 -rotate-90" />
        </a>

        {/* FAQ */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">
            Frequently asked questions
          </p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {FAQS.map((f, i) => (
              <button
                key={f.q}
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left px-4 py-3.5 active:bg-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-[13px] font-semibold text-foreground">{f.q}</p>
                  <ChevronDown
                    size={15}
                    className={`text-muted flex-shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                  />
                </div>
                {open === i && (
                  <p className="mt-2 text-[12px] text-muted leading-relaxed">{f.a}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted text-center pb-2">
          OneGemmy · support@onegemmy.com
        </p>
      </div>
    </div>
  );
}
