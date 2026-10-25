"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { marketingApi, type EmailBlock, type Template } from "@/lib/api";
import { errorText, useMarketingMutation, useTemplate } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { ErrorState, Notice } from "@/components/ui/EmptyState";
import { EmailBuilder } from "@/components/marketing/EmailBuilder";
import { CATEGORY_LABEL, Flash } from "@/components/marketing/shared";
import { BackLink } from "@/components/traffic/shared";

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useTemplate(id);
  if (isLoading) return <PageLoader variant="page" />;
  if (isError) return <ErrorState message="Could not load this template." onRetry={() => void refetch()} />;
  if (!data) return <ErrorState message="Template not found." />;
  return <TemplateEditor key={data.id} data={data} />;
}

function TemplateEditor({ data }: { data: Template }) {
  const id = data.id;
  const router = useRouter();
  const [form, setForm] = useState({ name: data.name, category: data.category, description: data.description ?? "", subject: data.subject ?? "", preheader: data.preheader ?? "" });
  const [blocks, setBlocks] = useState<EmailBlock[]>(data.blocks);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const save = useMarketingMutation(() => marketingApi.updateTemplate(id, { ...form, blocks }).then((r) => r.data));
  const copy = useMarketingMutation(() => marketingApi.templateAction(id, "duplicate").then((r) => r.data as { id: string }));

  const readOnly = data.is_system || data.status === "archived";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setForm((f) => ({ ...f, [k]: e.target.value })); setDirty(true); };
  const onSave = async () => { setMsg(null); try { await save.mutateAsync(undefined as never); setDirty(false); setMsg({ tone: "ok", text: "Template saved." }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/marketing/templates" label="Back to templates" />} title={data.name} subtitle={CATEGORY_LABEL[data.category]}
        actions={<>{data.is_system && <Badge tone="violet">Starter template</Badge>}
          {data.is_system ? <Button onClick={async () => { const t = await copy.mutateAsync(undefined as never); router.push(`/marketing/templates/${t.id}`); }}><Copy size={14} /> Duplicate to edit</Button>
            : <Button onClick={onSave} disabled={save.isPending || !dirty || readOnly}>{save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button>}</>} />
      {data.is_system && <Notice tone="blue">Starter templates can&apos;t be changed. Duplicate it to make your own version.</Notice>}
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}
      <fieldset disabled={readOnly} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Template name" required><Input value={form.name} onChange={set("name")} maxLength={160} /></Field>
        <Field label="Category"><Select value={form.category} onChange={set("category")}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Default subject line"><Input value={form.subject} onChange={set("subject")} maxLength={300} /></Field>
        <Field label="Preview text" hint="The grey text shown next to the subject in the inbox."><Input value={form.preheader} onChange={set("preheader")} maxLength={200} /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={form.description} onChange={set("description")} maxLength={300} /></Field>
      </fieldset>
      <EmailBuilder blocks={blocks} onChange={(b) => { setBlocks(b); setDirty(true); }} subject={form.subject} preheader={form.preheader} disabled={readOnly} />
    </div>
  );
}
