interface LogoMarkProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** The Pesaa brand mark on its own — a bold "P" monogram, matching the
 *  favicon/app-icon design. Uses currentColor so it can sit on any
 *  background (the sidebar/login badge use the tenant's own accent color). */
export function LogoMark({ size = 16, className, strokeWidth = 2.6 }: LogoMarkProps) {
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
      <path d="M8 5v14" />
      <path d="M8 5h5a3.5 3.5 0 0 1 0 7h-5" />
    </svg>
  );
}
