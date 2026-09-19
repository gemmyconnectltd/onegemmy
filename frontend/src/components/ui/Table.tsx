import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

// Responsive table container — scrolls horizontally on small screens.
export function TableWrap({ children, className = "" }: Props) {
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
