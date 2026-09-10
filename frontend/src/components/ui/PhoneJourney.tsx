"use client";

import { useEffect, useState } from "react";
import { PhoneScreenshot } from "@/components/ui/PhoneScreenshot";

const STEP_DURATION = 4000;

const STEPS = [
  {
    label: "Open the app, see today's sales",
    src: "/screenshots/mobile-home.png",
    alt: "OneGemmy mobile app home screen showing today's sales",
  },
  {
    label: "Ring up a sale from anywhere",
    src: "/screenshots/mobile-pos.png",
    alt: "OneGemmy mobile point of sale screen with the product list",
  },
  {
    label: "Check how the day's going",
    src: "/screenshots/mobile-stats.png",
    alt: "OneGemmy mobile stats screen showing revenue, profit, and top products",
  },
  {
    label: "Look back at every sale",
    src: "/screenshots/mobile-transactions.png",
    alt: "OneGemmy mobile transactions screen listing recent sales",
  },
];

export function PhoneJourney() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), STEP_DURATION);
    return () => clearTimeout(timer);
  }, [active, paused]);

  return (
    <div
      className="flex flex-col items-center gap-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative w-[240px]">
        {/* Spacer reserving layout height */}
        <div className="invisible" aria-hidden>
          <PhoneScreenshot src={STEPS[0].src} alt="" />
        </div>
        {STEPS.map((step, i) => (
          <div
            key={step.src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === active ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <PhoneScreenshot src={step.src} alt={step.alt} priority={i === 0} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <button
            key={step.src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={step.label}
            className="group py-2 cursor-pointer"
          >
            <span
              className={`block h-1.5 rounded-full transition-all overflow-hidden ${
                i === active ? "w-8 bg-white/20" : "w-1.5 bg-white/20 group-hover:bg-white/30"
              }`}
            >
              {i === active && (
                <span
                  key={active}
                  className="block h-full bg-[#e8a488] rounded-full"
                  style={{
                    animation: `journeyProgress ${STEP_DURATION}ms linear forwards`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      <p className="text-sm text-white/60 text-center min-h-[1.25rem]">
        {STEPS[active].label}
      </p>
    </div>
  );
}
