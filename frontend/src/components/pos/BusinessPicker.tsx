import { Check, Store } from "lucide-react";

import { BUSINESS_TYPES } from "./catalog";
import { IconBadge, getBusinessIcon } from "./icons";
import type { BusinessType } from "./types";

interface BusinessPickerProps {
  current: BusinessType;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function BusinessPicker({ current, onSelect, onClose }: BusinessPickerProps) {
  return (
    <div className="border-t border-border bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
        <Store size={12} /> Switch business type
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[260px] overflow-y-auto">
        {BUSINESS_TYPES.map((b) => {
          const isCurrent = b.id === current.id;
          return (
            <button
              key={b.id}
              onClick={() => { onSelect(b.id); onClose(); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                isCurrent ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
              }`}
              style={isCurrent ? undefined : { ["--accent" as string]: b.accent }}
            >
              <IconBadge Icon={getBusinessIcon(b)} size={15} color={b.accent} className="w-8 h-8" />
              <span className="text-[12px] font-semibold text-foreground leading-tight">{b.label}</span>
              {isCurrent && <Check size={13} className="ml-auto text-accent flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
