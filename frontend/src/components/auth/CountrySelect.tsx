"use client";

import Image from "next/image";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export interface CountryOption { name: string; code: string; dial: string; }

/** Local SVG flags avoid platform-dependent emoji rendering. Base UI supplies keyboard/typeahead support. */
export function CountrySelect({ countries, value, onChange, phone = false }: {
  countries: CountryOption[]; value: string; onChange: (value: string) => void; phone?: boolean;
}) {
  const selected = countries.find(country => country.name === value);
  const flag = (country: CountryOption) => <Image src={`/flags/${country.code.toLowerCase()}.svg`} width={22} height={16} alt="" aria-hidden className="h-4 w-6 shrink-0 rounded-sm object-cover" unoptimized />;
  return <Select.Root value={value || null} onValueChange={next => { if (next) onChange(next); }} required name={phone ? "phone_country" : "country"} items={countries.map(country => ({ value: country.name, label: `${country.name} ${country.dial}` }))}>
    <Select.Trigger aria-label={phone ? "Phone country code" : "Country"} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-surface/30 px-3 text-sm text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20">
      {selected && flag(selected)}<span className="min-w-0 flex-1 truncate text-left">{selected ? phone ? selected.dial : selected.name : phone ? "Code" : "Select your country"}</span><ChevronDown size={14} className="shrink-0 text-muted" />
    </Select.Trigger>
    <Select.Portal><Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-50 max-w-[calc(100vw-32px)]"><Select.Popup className="max-h-72 min-w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"><Select.List>{countries.map(country => <Select.Item key={country.code} value={country.name} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground outline-none data-highlighted:bg-primary/5"><Select.ItemIndicator className="w-4 shrink-0"><Check size={14} className="text-accent" /></Select.ItemIndicator>{flag(country)}<Select.ItemText className="min-w-0 flex-1">{country.name}</Select.ItemText><span className="text-xs text-muted">{country.dial}</span></Select.Item>)}</Select.List></Select.Popup></Select.Positioner></Select.Portal>
  </Select.Root>;
}
