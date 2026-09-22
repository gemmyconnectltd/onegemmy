"use client";
import { useState } from "react";
import { Select, Input } from "@/components/ui/Form";

interface SelectWithOtherProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  otherOption?: string;
  placeholder?: string;
}

/** A `<select>` whose "Other" option reveals a required text input right
 *  below it — picking "Other" is never itself a usable category/reason, so
 *  the value passed to `onChange` is always either a preset option or
 *  whatever the user typed in its place. Used anywhere we record something
 *  (expenses, restocks, stock adjustments) against a category/reason list
 *  that can't cover every case.
 *
 *  "Other" mode is local state, initialized from whether `value` is already
 *  a custom (non-preset) string. If a parent needs to reset it back out of
 *  "Other" mode from outside — e.g. switching to a different `options` list
 *  without unmounting — pass a `key` that changes with that reset so this
 *  remounts with fresh state, rather than syncing it with an effect. */
export function SelectWithOther({ options, value, onChange, otherOption = "Other", placeholder = "Type it in…" }: SelectWithOtherProps) {
  const [isOther, setIsOther] = useState(() => value !== "" && !options.includes(value));

  const handleSelect = (v: string) => {
    if (v === otherOption) {
      setIsOther(true);
      onChange(""); // force the user to type something meaningful
    } else {
      setIsOther(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={isOther ? otherOption : value} onChange={(e) => handleSelect(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
      {isOther && (
        <Input autoFocus required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}
