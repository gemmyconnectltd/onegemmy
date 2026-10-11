"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AI_STATE_EVENT, ASK_AI_EVENT, SUPPORT_WHATSAPP_URL } from "@/lib/support";

const FAB = "fab-in group relative flex h-[50px] w-[50px] items-center justify-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const TIP = "fab-label pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground shadow-md";

function WhatsAppIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5a9.43 9.43 0 0 1-4.8-1.31l-.34-.2-3.57.94.95-3.48-.22-.36a9.45 9.45 0 0 1-1.45-5.03c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.9.99 6.69 2.78a9.4 9.4 0 0 1 2.77 6.7c0 5.22-4.25 9.47-9.51 9.47zM12.04 0C5.46 0 .1 5.35.1 11.93c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 0 0 5.77 1.47h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.19-1.24-6.19-3.5-8.44A11.86 11.86 0 0 0 12.04 0z" />
    </svg>
  );
}

/**
 * Two small floating buttons, stacked bottom-right, each with its name always visible beside it: Pesaa AI (opens the assistant) and WhatsApp Support. They step
 * aside while the assistant is open. `ai={false}` leaves only WhatsApp where the assistant isn't available
 * (the platform admin console has no business data to ask about).
 */
export function SupportFab({ ai = true }: { ai?: boolean }) {
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => setAiOpen(!!(e as CustomEvent<{ open: boolean }>).detail?.open);
    window.addEventListener(AI_STATE_EVENT, onState);
    return () => window.removeEventListener(AI_STATE_EVENT, onState);
  }, []);

  if (aiOpen) return null;
  return (
    <div className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-3 pb-[env(safe-area-inset-bottom)] sm:right-6">
      {ai && (
        <button type="button" aria-label="Ask Pesaa AI" onClick={() => window.dispatchEvent(new CustomEvent(ASK_AI_EVENT))}
          style={{ animationDelay: "0.2s" }} className={`${FAB} fab-ring bg-accent hover:bg-accent/90 focus-visible:ring-accent`}>
          <Sparkles size={22} />
          <span className={TIP} style={{ animationDelay: "0.55s" }}>Ask Pesaa AI</span>
        </button>
      )}
      <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"
        style={{ animationDelay: "0.35s" }} className={`${FAB} bg-[#25D366] hover:bg-[#20bd5a] focus-visible:ring-[#25D366]`}>
        <WhatsAppIcon />
        <span className={TIP} style={{ animationDelay: "0.7s" }}>Chat with us</span>
      </a>
    </div>
  );
}
