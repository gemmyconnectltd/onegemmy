"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Eye, FileText, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import { marketingApi, type Template } from "@/lib/api";
import { errorText, useMarketingMutation, useTemplates } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Form";
import { SearchBox } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { EmailPreview } from "@/components/marketing/EmailBuilder";
import { CATEGORY_LABEL, Flash, day } from "@/components/marketing/shared";

export default function TemplatesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const [error, setError] = useState("");
  const { data, isLoading, isError, refetch } = useTemplates({ q: q || undefined, category: category || undefined, status: archived ? "archived" : "active" });
  const create = useMarketingMutation(() => marketingApi.createTemplate({ name: "Untitled template", category: "campaign", blocks: [] }).then((r) => r.data));
  const act = useMarketingMutation((v: { id: string; a: "duplicate" | "archive" | "restore" }) => marketingApi.templateAction(v.id, v.a));
  const use = useMarketingMutation((t: Template) => marketingApi.createCampaign({ name: `${t.name} campaign`, template_id: t.id, kind: t.category === "newsletter" ? "newsletter" : "campaign" }).then((r) => r.data));
  const run = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); } catch (e) { setError(errorText(e)); } };

  return (
    <div className="space-y-4">
      <PageHeader title="Templates" subtitle="Reusable, branded email layouts for campaigns, newsletters and automations."
        actions={<Button onClick={() => run(async () => router.push(`/marketing/templates/${(await create.mutateAsync(undefined as never)).id}`))} disabled={create.isPending}><Plus size={14} /> New template</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search templates" />
        <Select aria-label="Category" className="w-auto!" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button variant={archived ? "default" : "outline"} onClick={() => setArchived((v) => !v)} aria-pressed={archived}><Archive size={14} /> Archived</Button>
      </div>
      {error && <Flash tone="error">{error}</Flash>}
      {isLoading ? <PageLoader variant="compact" /> : isError ? <ErrorState message="Could not load templates." onRetry={() => void refetch()} /> : !data?.length ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState icon={FileText} title={archived ? "No archived templates" : "No templates match"} description={archived ? undefined : "Try another search, or create a new template."} /></div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <li key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-bold">{t.name}</h2>{t.is_system && <Badge tone="violet">Starter</Badge>}</div>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">{CATEGORY_LABEL[t.category] ?? t.category}</p>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-[12.5px] text-muted">{t.description ?? t.subject ?? "No description"}</p>
              <p className="mt-1 truncate text-[11px] text-muted">Subject: {t.subject || "—"} · Updated {day(t.updated_at)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setPreview(t)}><Eye size={13} /> Preview</Button>
                {!t.is_system && !archived && <Button size="sm" variant="outline" onClick={() => router.push(`/marketing/templates/${t.id}`)}><Pencil size={13} /> Edit</Button>}
                {!archived && <Button size="sm" variant="outline" onClick={() => run(() => use.mutateAsync(t).then((c) => router.push(`/marketing/${c.kind === "newsletter" ? "newsletters" : "campaigns"}/${c.id}`)))}><Send size={13} /> Use</Button>}
                <Button size="sm" variant="ghost" onClick={() => run(() => act.mutateAsync({ id: t.id, a: "duplicate" }))}><Copy size={13} /> Duplicate</Button>
                {!t.is_system && (archived ? <Button size="sm" variant="ghost" onClick={() => run(() => act.mutateAsync({ id: t.id, a: "restore" }))}><RotateCcw size={13} /> Restore</Button>
                  : <Button size="sm" variant="ghost" onClick={() => run(() => act.mutateAsync({ id: t.id, a: "archive" }))}><Archive size={13} /> Archive</Button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Drawer open={!!preview} onClose={() => setPreview(null)} side="right" size="xl" title={preview?.name} description={preview?.subject ? `Subject: ${preview.subject}` : undefined}>
        {preview && <div className="p-5"><EmailPreview blocks={preview.blocks} subject={preview.subject ?? ""} preheader={preview.preheader ?? ""} /></div>}
      </Drawer>
    </div>
  );
}
