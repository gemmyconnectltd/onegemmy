"use client";

import { Toggle as UIToggle } from "@/components/ui/Toggle";

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <UIToggle checked={on} onChange={onChange} />;
}
