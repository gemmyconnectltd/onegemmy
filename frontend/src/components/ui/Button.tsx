"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: string; // overrides primary color
  size?: "sm" | "md";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  color,
  size = "md",
  className = "",
  style,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
  };

  const variants: Record<ButtonVariant, string> = {
    primary: "text-white",
    secondary: "border border-border text-foreground/60 hover:text-foreground hover:bg-surface",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    ghost: "text-muted hover:text-foreground hover:bg-surface",
  };

  // For primary, use inline style so any module color works
  const isPrimary = variant === "primary";
  const primaryColor = color ?? "var(--accent)";
  const inlineStyle =
    isPrimary
      ? {
          backgroundColor: primaryColor,
          ...style,
        }
      : style;

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={inlineStyle}
      onMouseEnter={
        isPrimary
          ? (e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
            }
          : undefined
      }
      onMouseLeave={
        isPrimary
          ? (e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            }
          : undefined
      }
      {...props}
    >
      {children}
    </button>
  );
}
