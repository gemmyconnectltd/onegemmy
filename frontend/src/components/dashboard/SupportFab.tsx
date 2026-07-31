"use client";

import { useState } from "react";
import { BookOpen, LifeBuoy, Mail, MessagesSquare, X } from "lucide-react";

export function SupportFab() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="bg-white border border-border shadow-2xl rounded-2xl w-72 overflow-hidden">
          <div className="px-4 py-3 bg-accent text-white flex items-center gap-2.5">
            <LifeBuoy size={16} className="flex-shrink-0" />
            <div>
              <p className="text-[13px] font-bold leading-tight">Support</p>
              <p className="text-[11px] text-white/70 leading-tight">How can we help?</p>
            </div>
          </div>
          <a
            href="mailto:support@onegemmy.com"
            className="flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-foreground hover:bg-surface transition-colors border-b border-border"
          >
            <Mail size={16} className="text-foreground/40" /> Contact support
          </a>
          <button
            onClick={() => { setOpen(false); window.alert("Help Center is coming soon."); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-foreground hover:bg-surface transition-colors text-left border-b border-border"
          >
            <BookOpen size={16} className="text-foreground/40" /> Help Center
          </button>
          <button
            onClick={() => { setOpen(false); window.alert("Chat is coming soon."); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-foreground hover:bg-surface transition-colors text-left"
          >
            <MessagesSquare size={16} className="text-foreground/40" /> Live chat
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Support"
        aria-expanded={open}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-95 ${
          open ? "bg-foreground text-white rotate-90" : "bg-accent text-white hover:bg-accent/90 hover:scale-105"
        }`}
      >
        {open ? <X size={24} /> : <LifeBuoy size={24} />}
      </button>
    </div>
  );
}
