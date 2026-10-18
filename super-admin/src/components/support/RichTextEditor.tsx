"use client";

import { useId, useRef, useState } from "react";
import { Bold, Braces, Italic, Link2, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_VARIABLES, unknownVariables } from "@/lib/support/richText";

type Edit = { value: string; selStart: number; selEnd: number };

function wrap(value: string, a: number, b: number, before: string, after: string, placeholder: string): Edit {
  const sel = value.slice(a, b) || placeholder;
  const next = value.slice(0, a) + before + sel + after + value.slice(b);
  return { value: next, selStart: a + before.length, selEnd: a + before.length + sel.length };
}

function prefixLines(value: string, a: number, b: number, prefix: (i: number) => string): Edit {
  const start = value.lastIndexOf("\n", a - 1) + 1;
  const endIdx = value.indexOf("\n", b);
  const end = endIdx === -1 ? value.length : endIdx;
  const lines = value.slice(start, end).split("\n").map((l, i) => prefix(i) + l.replace(/^\s*([-*]|\d+[.)])\s+/, ""));
  const block = lines.join("\n");
  return { value: value.slice(0, start) + block + value.slice(end), selStart: start, selEnd: start + block.length };
}

/**
 * Plain-text editor with a formatting toolbar. Content is stored as Markdown-style text (**bold**, _italic_, lists,
 * [links](https://…)) and rendered by the safe RichText renderer, so no HTML is ever stored or injected.
 */
export function RichTextEditor({ value, onChange, rows = 10, placeholder, label, error, variables = true, className }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
  error?: string;
  variables?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const unknown = unknownVariables(value);

  const apply = (fn: (v: string, a: number, b: number) => Edit) => {
    const el = ref.current;
    if (!el) return;
    const edit = fn(value, el.selectionStart, el.selectionEnd);
    onChange(edit.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(edit.selStart, edit.selEnd); });
  };
  const insert = (text: string) => apply((v, a, b) => ({ value: v.slice(0, a) + text + v.slice(b), selStart: a + text.length, selEnd: a + text.length }));

  const tool = "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</label>}
      <div className={cn("rounded-lg border bg-card focus-within:border-accent", error ? "border-red-500" : "border-border")}>
        <div className="relative flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1" role="toolbar" aria-label="Formatting">
          <button type="button" className={tool} title="Bold" aria-label="Bold" onClick={() => apply((v, a, b) => wrap(v, a, b, "**", "**", "bold text"))}><Bold size={14} /></button>
          <button type="button" className={tool} title="Italic" aria-label="Italic" onClick={() => apply((v, a, b) => wrap(v, a, b, "_", "_", "italic text"))}><Italic size={14} /></button>
          <button type="button" className={tool} title="Bulleted list" aria-label="Bulleted list" onClick={() => apply((v, a, b) => prefixLines(v, a, b, () => "- "))}><List size={14} /></button>
          <button type="button" className={tool} title="Numbered list" aria-label="Numbered list" onClick={() => apply((v, a, b) => prefixLines(v, a, b, (i) => `${i + 1}. `))}><ListOrdered size={14} /></button>
          <button type="button" className={tool} title="Link" aria-label="Insert link" onClick={() => apply((v, a, b) => { const e = wrap(v, a, b, "[", "](https://)", "link text"); return { ...e, selStart: e.selEnd + 2, selEnd: e.selEnd + 10 }; })}><Link2 size={14} /></button>
          {variables && (
            <div className="relative ml-auto">
              <button type="button" className={cn(tool, "w-auto gap-1 px-2 text-[12px] font-semibold")} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}><Braces size={13} /> Variables</button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <ul role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
                    {SUPPORTED_VARIABLES.map((v) => (
                      <li key={v.key} role="none">
                        <button type="button" role="menuitem" className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface" onClick={() => { insert(`{{${v.key}}}`); setMenu(false); }}>
                          <span>{v.label}</span><code className="text-[11px] text-muted">{`{{${v.key}}}`}</code>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <textarea
          id={id} ref={ref} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          aria-invalid={!!error} className="block w-full resize-y bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-muted/60 sm:text-[13.5px]"
        />
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-red-600">{error}</p>}
      {unknown.length > 0 && <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `{{${u}}}`).join(", ")}. Only the listed variables are replaced.</p>}
    </div>
  );
}
