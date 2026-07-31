"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-[12px] font-semibold text-muted mb-1.5">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

const baseControl =
  "w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:border-accent bg-transparent placeholder:text-muted/60 transition-colors";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${baseControl} ${className ?? ""}`} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${baseControl} ${className ?? ""}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${baseControl} resize-none ${className ?? ""}`} {...props} />;
}

export function FormFooter({
  submitLabel = "Save",
  onCancel,
  disabled,
  cancelLabel = "Cancel",
}: {
  submitLabel?: string;
  onCancel: () => void;
  disabled?: boolean;
  cancelLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2.5 text-[13px] font-semibold border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="flex-1 px-4 py-2.5 text-[13px] font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </div>
  );
}
