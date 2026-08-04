"use client";

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative w-11 h-[26px] rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
        on ? "bg-accent" : "bg-muted/30 ring-1 ring-inset ring-black/10"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          on ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
