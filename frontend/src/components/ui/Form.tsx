"use client";

import { cloneElement, isValidElement, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Button } from "./Button";

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
  const generatedId = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const controlId = control?.props.id ?? generatedId;
  const hintId = `${controlId}-hint`;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={control ? controlId : undefined} className="block text-[13px] font-medium text-foreground mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {control ? cloneElement(control, { id: controlId, "aria-describedby": [control.props["aria-describedby"], hint ? hintId : null].filter(Boolean).join(" ") || undefined }) : children}
      {hint && <p id={hintId} className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

const baseControl =
  "pesaa-control placeholder:text-muted/60 transition-colors";

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
  color,
}: {
  submitLabel?: string;
  onCancel: () => void;
  disabled?: boolean;
  cancelLabel?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
        {cancelLabel}
      </Button>
      <Button type="submit" variant="primary" color={color} disabled={disabled} className="flex-1">
        {submitLabel}
      </Button>
    </div>
  );
}
