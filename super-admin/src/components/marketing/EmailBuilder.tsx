"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Columns2, Copy, Heading as HeadingIcon, ImageIcon, Minus, MousePointerClick, Plus, Share2, Space, Trash2, Type, PanelTop, AlignLeft, Monitor, Smartphone } from "lucide-react";
import { marketingApi, type BlockType, type EmailBlock } from "@/lib/api";
import { errorText } from "@/lib/marketing/hooks";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Flash } from "./shared";
import { cn } from "@/lib/utils";

const META: Record<BlockType, { label: string; icon: React.ElementType; make: () => Record<string, unknown> }> = {
  header: { label: "Header", icon: PanelTop, make: () => ({ tagline: "" }) },
  heading: { label: "Heading", icon: HeadingIcon, make: () => ({ text: "Your headline", level: 2, align: "left" }) },
  paragraph: { label: "Paragraph", icon: Type, make: () => ({ text: "Write your message here.", align: "left" }) },
  image: { label: "Image", icon: ImageIcon, make: () => ({ url: "", alt: "", link: "", full: true }) },
  button: { label: "Button", icon: MousePointerClick, make: () => ({ label: "Learn more", url: "https://pesaa.io", align: "center" }) },
  divider: { label: "Divider", icon: Minus, make: () => ({}) },
  spacer: { label: "Spacer", icon: Space, make: () => ({ height: 24 }) },
  columns: { label: "Columns", icon: Columns2, make: () => ({ items: [{ title: "First", text: "", image: "", label: "", url: "" }, { title: "Second", text: "", image: "", label: "", url: "" }] }) },
  social: { label: "Social links", icon: Share2, make: () => ({ links: [{ network: "website", url: "https://pesaa.io" }] }) },
  footer: { label: "Footer note", icon: AlignLeft, make: () => ({ text: "" }) },
};
const ORDER: BlockType[] = ["header", "heading", "paragraph", "image", "button", "columns", "divider", "spacer", "social", "footer"];
const VARS = ["first_name", "business_name", "name", "plan", "country"];
export const newBlock = (type: BlockType): EmailBlock => ({ id: crypto.randomUUID().slice(0, 8), type, props: META[type].make() });

/** Live preview: the server renders the same HTML recipients receive; `mobile` narrows the frame. */
export function EmailPreview({ blocks, subject, preheader, className }: { blocks: EmailBlock[]; subject: string; preheader: string; className?: string }) {
  const [mobile, setMobile] = useState(false);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { setHtml((await marketingApi.render({ blocks, subject, preheader })).data.html); setError(""); } catch (e) { setError(errorText(e, "Couldn't render the preview.")); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [blocks, subject, preheader]);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Preview</p>
        <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-border p-0.5">
          {([[false, Monitor, "Desktop"], [true, Smartphone, "Mobile"]] as const).map(([m, Icon, label]) => (
            <button key={label} type="button" aria-pressed={mobile === m} onClick={() => setMobile(m)} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold", mobile === m ? "bg-accent text-white" : "text-muted hover:text-foreground")}><Icon size={13} aria-hidden />{label}</button>
          ))}
        </div>
      </div>
      {error && <Flash tone="error">{error}</Flash>}
      <div className="min-h-[420px] flex-1 overflow-auto rounded-xl border border-border bg-surface p-3">
        <iframe title="Email preview" sandbox="" srcDoc={html} className="mx-auto h-[640px] w-full rounded-lg bg-white transition-[max-width]" style={{ maxWidth: mobile ? 375 : 640 }} />
      </div>
    </div>
  );
}

/** An image address field with an upload button (stored through the shared uploads folder). */
function ImageField({ value, onPick }: { value: string; onPick: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file: File) => { setBusy(true); setError(""); try { onPick(await marketingApi.uploadImage(file)); } catch (e) { setError(errorText(e, "Upload failed")); } setBusy(false); };
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input aria-label="Image address" value={value} onChange={(e) => onPick(e.target.value)} placeholder="https://… or upload" />
        <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-surface">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />{busy ? "Uploading…" : "Upload"}
        </label>
      </div>
      {error && <Flash tone="error">{error}</Flash>}
    </div>
  );
}

function PropsEditor({ block, set }: { block: EmailBlock; set: (patch: Record<string, unknown>) => void }) {
  const p = block.props as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const vars = (field: string) => <div className="mt-1 flex flex-wrap gap-1">{VARS.map((v) => <button key={v} type="button" className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground" onClick={() => set({ [field]: `${p[field] ?? ""}{{${v}}}` })}>{`{{${v}}}`}</button>)}</div>;
  const align = (
    <Field label="Alignment"><Select value={p.align ?? "left"} onChange={(e) => set({ align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></Select></Field>
  );
  switch (block.type) {
    case "header": return <Field label="Tagline (optional)"><Input value={p.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} maxLength={120} /></Field>;
    case "heading": return <div className="grid gap-3 sm:grid-cols-3"><Field label="Text" className="sm:col-span-3"><Input value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} maxLength={200} />{vars("text")}</Field>
      <Field label="Size"><Select value={p.level ?? 2} onChange={(e) => set({ level: Number(e.target.value) })}><option value={1}>Large</option><option value={2}>Medium</option><option value={3}>Small</option></Select></Field>{align}</div>;
    case "paragraph": return <div className="space-y-3"><Field label="Text" hint="Use **bold**, [link text](https://…) and blank lines for paragraphs."><Textarea rows={5} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} className="resize-y" />{vars("text")}</Field>{align}</div>;
    case "image": return <div className="space-y-3"><ImageField value={p.url ?? ""} onPick={(u) => set({ url: u })} />
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Description (alt text)" hint="Read by screen readers and shown when images are blocked."><Input value={p.alt ?? ""} onChange={(e) => set({ alt: e.target.value })} maxLength={160} /></Field><Field label="Link (optional)"><Input value={p.link ?? ""} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" /></Field></div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={p.full !== false} onChange={(e) => set({ full: e.target.checked })} />Full width</label></div>;
    case "button": return <div className="grid gap-3 sm:grid-cols-3"><Field label="Label"><Input value={p.label ?? ""} onChange={(e) => set({ label: e.target.value })} maxLength={60} /></Field><Field label="Link" className="sm:col-span-2"><Input value={p.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></Field>{align}</div>;
    case "spacer": return <Field label="Height (px)"><Input type="number" min={8} max={96} value={p.height ?? 24} onChange={(e) => set({ height: Number(e.target.value) })} /></Field>;
    case "columns": {
      const items = (p.items ?? []) as Record<string, string>[];
      const patch = (i: number, k: string, v: string) => set({ items: items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
      return <div className="space-y-3">{items.map((it, i) => (
        <fieldset key={i} className="rounded-lg border border-border p-3"><legend className="px-1 text-[12px] font-semibold text-muted">Column {i + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="Title"><Input value={it.title ?? ""} onChange={(e) => patch(i, "title", e.target.value)} /></Field><Field label="Button label"><Input value={it.label ?? ""} onChange={(e) => patch(i, "label", e.target.value)} /></Field>
            <Field label="Text" className="sm:col-span-2"><Textarea rows={2} value={it.text ?? ""} onChange={(e) => patch(i, "text", e.target.value)} /></Field>
            <Field label="Link"><Input value={it.url ?? ""} onChange={(e) => patch(i, "url", e.target.value)} placeholder="https://…" /></Field><Field label="Image"><ImageField value={it.image ?? ""} onPick={(u) => patch(i, "image", u)} /></Field></div>
          {items.length > 1 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ items: items.filter((_, j) => j !== i) })}>Remove column</Button>}</fieldset>))}
        {items.length < 3 && <Button size="sm" variant="outline" onClick={() => set({ items: [...items, { title: "", text: "", image: "", label: "", url: "" }] })}><Plus size={13} /> Add column</Button>}</div>;
    }
    case "social": {
      const links = (p.links ?? []) as { network: string; url: string }[];
      const patch = (i: number, k: string, v: string) => set({ links: links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
      return <div className="space-y-2">{links.map((l, i) => <div key={i} className="flex gap-2"><Select aria-label="Network" className="w-36!" value={l.network} onChange={(e) => patch(i, "network", e.target.value)}>
        {["website", "facebook", "x", "linkedin", "instagram", "youtube", "whatsapp"].map((n) => <option key={n} value={n}>{n[0].toUpperCase() + n.slice(1)}</option>)}</Select>
        <Input aria-label="Link" value={l.url} onChange={(e) => patch(i, "url", e.target.value)} placeholder="https://…" /><Button size="sm" variant="ghost" aria-label="Remove link" onClick={() => set({ links: links.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button></div>)}
        {links.length < 7 && <Button size="sm" variant="outline" onClick={() => set({ links: [...links, { network: "website", url: "" }] })}><Plus size={13} /> Add link</Button>}</div>;
    }
    case "footer": return <Field label="Footer note" hint="The legal footer with the unsubscribe link is always added automatically."><Textarea rows={2} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} /></Field>;
    default: return <p className="text-[12px] text-muted">No options — this block has no settings.</p>;
  }
}

/** Block-based email editor: add, edit, reorder, duplicate and delete blocks, with a live preview of the real HTML. */
export function EmailBuilder({ blocks, onChange, subject, preheader, disabled }: { blocks: EmailBlock[]; onChange: (b: EmailBlock[]) => void; subject: string; preheader: string; disabled?: boolean }) {
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [open, setOpen] = useState<string | null>(blocks[0]?.id ?? null);
  const move = (i: number, d: -1 | 1) => { const n = [...blocks]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const patch = (id: string, props: Record<string, unknown>) => onChange(blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)));
  const summary = (b: EmailBlock) => String((b.props.text ?? b.props.label ?? b.props.tagline ?? (b.props.items as { title?: string }[] | undefined)?.[0]?.title ?? b.props.alt ?? "") || "").slice(0, 60);
  return (
    <div>
      <div className="mb-3 flex gap-1 lg:hidden" role="tablist" aria-label="Editor view">
        {(["edit", "preview"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={pane === t} onClick={() => setPane(t)} className={cn("flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold", pane === t ? "border-accent bg-accent/10 text-accent" : "border-border text-muted")}>{t === "edit" ? "Edit" : "Preview"}</button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn("space-y-2", pane === "preview" && "hidden lg:block")}>
          {blocks.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Your email is empty. Add a block below to begin.</p>}
          {blocks.map((b, i) => {
            const m = META[b.type];
            const isOpen = open === b.id;
            return (
              <div key={b.id} className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                    <m.icon size={15} className="flex-shrink-0 text-accent" aria-hidden /><span className="text-[13px] font-semibold">{m.label}</span><span className="truncate text-[12px] text-muted">{!isOpen && summary(b)}</span></button>
                  {!disabled && <div className="flex flex-shrink-0 items-center">
                    <button type="button" aria-label={`Move ${m.label} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button type="button" aria-label={`Move ${m.label} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"><ArrowDown size={14} /></button>
                    <button type="button" aria-label={`Duplicate ${m.label}`} onClick={() => { const copy = { ...b, id: crypto.randomUUID().slice(0, 8), props: structuredClone(b.props) }; const n = [...blocks]; n.splice(i + 1, 0, copy); onChange(n); setOpen(copy.id); }} className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"><Copy size={14} /></button>
                    <button type="button" aria-label={`Delete ${m.label}`} onClick={() => onChange(blocks.filter((x) => x.id !== b.id))} className="rounded p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={14} /></button></div>}
                </div>
                {isOpen && <fieldset disabled={disabled} className="border-t border-border p-3"><PropsEditor block={b} set={(props) => patch(b.id, props)} /></fieldset>}
              </div>
            );
          })}
          {!disabled && (
            <div className="rounded-xl border border-dashed border-border p-3">
              <p className="mb-2 text-[12px] font-semibold text-muted">Add a block</p>
              <div className="flex flex-wrap gap-1.5">{ORDER.map((t) => { const m = META[t]; return <button key={t} type="button" onClick={() => { const nb = newBlock(t); onChange([...blocks, nb]); setOpen(nb.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-accent hover:text-accent"><m.icon size={13} aria-hidden />{m.label}</button>; })}</div>
            </div>
          )}
        </div>
        <EmailPreview blocks={blocks} subject={subject} preheader={preheader} className={cn(pane === "edit" && "hidden lg:flex")} />
      </div>
    </div>
  );
}
