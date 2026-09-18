interface LogoMarkProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** The Pesaa brand mark on its own — a coin with a "P" monogram, matching
 *  the favicon/app-icon design. Uses currentColor so it can sit on any
 *  background (the sidebar/login badge use the tenant's own accent color). */
export function LogoMark({ size = 16, className, strokeWidth = 2.2 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.7 8v8" />
      <path d="M9.7 8h2.15a2.5 2.5 0 0 1 0 5h-2.15" />
    </svg>
  );
}
