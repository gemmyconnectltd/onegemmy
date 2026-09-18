"use client";

import { useEffect, useState } from "react";
import { AppScreenshot } from "@/components/ui/AppScreenshot";

const STEP_DURATION = 4500;

const STEPS = [
  {
    time: "9:14 AM",
    label: "Ring up a sale at the counter",
    src: "/screenshots/pos-terminal.png",
    path: "pos",
  },
  {
    time: "9:15 AM",
    label: "Stock updates instantly",
    src: "/screenshots/inventory.png",
    path: "inventory",
  },
  {
    time: "11:30 AM",
    label: "Follow up on a deal in the pipeline",
    src: "/screenshots/sales-pipeline.png",
    path: "crm",
  },
  {
    time: "2:00 PM",
    label: "Books stay in sync automatically",
    src: "/screenshots/accounting.png",
    path: "accounting",
  },
  {
    time: "5:45 PM",
    label: "Check the full picture before closing up",
    src: "/screenshots/dashboard.png",
    path: "dashboard",
  },
];

export function AppJourney() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), STEP_DURATION);
    return () => clearTimeout(timer);
  }, [active, paused]);

  return (
    <div
      className="flex flex-col lg:flex-row gap-10 lg:gap-14 items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="w-full lg:w-[300px] shrink-0 space-y-1">
        {STEPS.map((step, i) => (
          <button
            key={step.label}
            type="button"
            onClick={() => setActive(i)}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer ${
              i === active ? "bg-[#16a34a]/10" : "hover:bg-surface"
            }`}
          >
            <span className={`block text-xs font-mono mb-1 ${i === active ? "text-[#16a34a]" : "text-muted/60"}`}>
              {step.time}
            </span>
            <span className={`block text-sm font-semibold ${i === active ? "text-foreground" : "text-muted"}`}>
              {step.label}
            </span>
            {i === active && (
              <span className="block h-0.5 bg-border rounded-full mt-2.5 overflow-hidden">
                <span
                  key={active}
                  className="block h-full bg-[#16a34a] rounded-full"
                  style={{
                    animation: `journeyProgress ${STEP_DURATION}ms linear forwards`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative w-full lg:flex-1">
        {/* Spacer reserving layout height matching the screenshot frame */}
        <div className="invisible" aria-hidden>
          <AppScreenshot src={STEPS[0].src} alt="" path={STEPS[0].path} />
        </div>
        {STEPS.map((step, i) => (
          <div
            key={step.src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === active ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <AppScreenshot src={step.src} alt={step.label} path={step.path} priority={i === 0} />
          </div>
        ))}
      </div>
    </div>
  );
}
