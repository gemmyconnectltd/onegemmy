"use client";

import { Children, cloneElement, isValidElement, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { hasUnsavedChanges } from "@/lib/unsavedChanges";
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
  const content = Children.toArray(children);
  const controlIndex = content.findIndex((child) => isValidElement(child) && (
    [Input, Select, Textarea].includes(child.type as typeof Input) ||
    (typeof child.type === "string" && ["input", "select", "textarea"].includes(child.type)) || content.length === 1
  ));
  const control = controlIndex >= 0 ? content[controlIndex] as React.ReactElement<{ id?: string; "aria-describedby"?: string }> : null;
  const controlId = control?.props.id ?? generatedId;
  const hintId = `${controlId}-hint`;
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      {label && (
        <label htmlFor={control ? controlId : undefined} className="block text-[13px] font-medium text-foreground mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {control ? content.map((child, index) => index === controlIndex ? cloneElement(control, { id: controlId, "aria-describedby": [control.props["aria-describedby"], hint ? hintId : null].filter(Boolean).join(" ") || undefined }) : child) : children}
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
      <Button type="button" variant="secondary" onClick={(e) => { const dialog = e.currentTarget.closest<HTMLElement>('[role="dialog"]'); if (!dialog || (dialog.dataset.workspaceDirty !== "true" && !hasUnsavedChanges(dialog)) || window.confirm("Discard unsaved changes?")) onCancel(); }} className="flex-1">
        {cancelLabel}
      </Button>
      <Button type="submit" variant="primary" color={color} disabled={disabled} className="flex-1">
        {submitLabel}
      </Button>
    </div>
  );
}
