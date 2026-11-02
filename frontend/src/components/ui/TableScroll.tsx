"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keeps wide tables inside their own keyboard-accessible scrolling region. `relative` matters: without it a visually hidden
 *  (sr-only, absolutely positioned) column header escapes the region and makes the whole page scroll sideways. */
export function TableScroll({ children, label = "Data table", className = "", mobileLayout = "scroll" }: {
  children: ReactNode;
  label?: string;
  className?: string;
  /** Explicitly opt directory/record tables into a compact list on phones. Financial tables keep their columns. */
  mobileLayout?: "scroll" | "cards";
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    if (mobileLayout === "cards") {
      const table = element.querySelector("table");
      table?.setAttribute("role", "table");
      table?.querySelectorAll("thead, tbody, tfoot").forEach((group) => group.setAttribute("role", "rowgroup"));
      table?.querySelectorAll("tr").forEach((row) => row.setAttribute("role", "row"));
      table?.querySelectorAll("th").forEach((cell) => cell.setAttribute("role", "columnheader"));
      table?.querySelectorAll("td").forEach((cell) => cell.setAttribute("role", "cell"));
      const labels = [...(table?.querySelectorAll("thead th") ?? [])].map((header) => header.textContent?.trim() ?? "");
      table?.querySelectorAll("tbody tr").forEach((row) => {
        [...row.children].forEach((cell, index) => {
          if (cell instanceof HTMLTableCellElement && cell.colSpan === 1) cell.dataset.label = labels[index] || "";
        });
      });
    }
    measure();
    return () => observer.disconnect();
  }, [children, mobileLayout]);

  return (
    <div className={`w-full min-w-0 max-w-full [contain:inline-size] print:[contain:none] ${className}`} data-table-container data-mobile-layout={mobileLayout}>
      {overflows && (
        <p className="border-b border-border bg-surface/50 px-3 py-1 text-[11px] text-muted print:hidden">
          Scroll horizontally to view all columns
        </p>
      )}
      <div ref={viewport} role="region" aria-label={label} tabIndex={overflows ? 0 : undefined}
        className="pesaa-table-scroll relative w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent print:overflow-visible">
        {children}
      </div>
    </div>
  );
}
