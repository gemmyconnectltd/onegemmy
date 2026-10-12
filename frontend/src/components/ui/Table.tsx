import type { ReactNode } from "react";
import { TableScroll } from "./TableScroll";

interface Props {
  children: ReactNode;
  className?: string;
}

// Responsive table container — scrolls horizontally on small screens.
export function TableWrap({ children, className = "" }: Props) {
  return (
    <div className={`bg-card border border-border rounded-xl min-w-0 max-w-full overflow-hidden ${className}`}>
      <TableScroll>
        {children}
      </TableScroll>
    </div>
  );
}
