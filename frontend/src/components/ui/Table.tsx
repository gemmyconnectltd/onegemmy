import type { ReactNode } from "react";
import { TableScroll } from "./TableScroll";

interface Props {
  children: ReactNode;
  className?: string;
  mobileLayout?: "scroll" | "cards";
}

// Responsive table container — scrolls horizontally on small screens.
export function TableWrap({ children, className = "", mobileLayout = "scroll" }: Props) {
  return (
    <div className={`bg-card border border-border rounded-xl min-w-0 max-w-full overflow-hidden ${className}`}>
      <TableScroll mobileLayout={mobileLayout}>
        {children}
      </TableScroll>
    </div>
  );
}
