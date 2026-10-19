"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./Form";
import { TableScroll } from "./TableScroll";

/** The card every table sits in — same border, radius and horizontal scrolling everywhere. */
export function DataCard({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}><TableScroll label={label}>{children}</TableScroll></div>;
}

export const thClass = "px-4 py-3 text-xs font-semibold text-muted";

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, noun = "result" }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-1 text-[12px] text-muted">{total.toLocaleString()} {noun}{total === 1 ? "" : "s"}</p>;
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-[12px] text-muted">
      <span>{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
        <span className="px-2">Page {page} / {pages}</span>
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

/** Client-side paging for a list that is already filtered and sorted. Resets to page 1 when `resetKey` changes. */
export function usePaged<T>(items: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page = state.key === resetKey ? state.page : 1;
  const safe = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)));
  const slice = useMemo(() => items.slice((safe - 1) * pageSize, safe * pageSize), [items, safe, pageSize]);
  return { page: safe, slice, setPage: (p: number) => setState({ page: p, key: resetKey }) };
}

export function SortHeader({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn(thClass, className)}>
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 uppercase tracking-wider", active && "text-foreground")}>{label}<span aria-hidden className="text-[9px]">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span></button>
    </th>
  );
}
