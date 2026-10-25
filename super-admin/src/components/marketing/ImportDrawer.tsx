"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { marketingApi, type ImportResult } from "@/lib/api";
import { errorText, useMarketingMutation } from "@/lib/marketing/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Flash } from "./shared";

const TEMPLATE = "email,name,company,phone,country,tags\nname@business.com,Amina Uwase,Amina Pharmacy,+250788000000,Rwanda,retail;vip\n";

/** CSV import with a dry run first: shows exactly what would be added and why other rows were skipped (invalid or test
 *  addresses, duplicates in the file, people already in your contacts). Nothing is written until the admin confirms
 *  that these people agreed to receive email. */
export function ImportDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [tags, setTags] = useState("");
  const [ok, setOk] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const run = useMarketingMutation((dry: boolean) => marketingApi.importContacts({ csv, consent_source: source, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), dry_run: dry, confirm_permission: ok }).then((r) => r.data));
  const reset = () => { setCsv(""); setSource(""); setTags(""); setOk(false); setPreview(null); setDone(null); setError(""); };
  const check = async () => { setError(""); setDone(null); try { setPreview(await run.mutateAsync(true)); } catch (e) { setPreview(null); setError(errorText(e)); } };
  const commit = async () => { setError(""); try { setDone(await run.mutateAsync(false)); setPreview(null); } catch (e) { setError(errorText(e)); } };
  const result = done ?? preview;
  const close = () => { reset(); onClose(); };
  return (
    <Drawer open={open} onClose={close} side="right" size="xl" title="Import contacts" description="Add people who agreed to hear from you. Invalid, test and duplicate addresses are skipped."
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>{done ? "Close" : "Cancel"}</Button>
        {!done && <><Button variant="outline" onClick={check} disabled={!csv.trim() || source.trim().length < 3 || run.isPending}>Check file</Button>
          <Button onClick={commit} disabled={!preview || preview.new === 0 || !ok || run.isPending}>Import {preview?.new ?? 0} contacts</Button></>}</div>}>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPreview(null); setDone(null); } e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()}><Upload size={14} aria-hidden /> Choose CSV file</Button>
          <a className="text-[12px] font-semibold text-accent hover:underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="pesaa-contacts-template.csv">Download template</a>
          {csv && <span className="text-[12px] text-muted">{csv.split("\n").filter(Boolean).length - 1} rows loaded</span>}
        </div>
        <Field label="Or paste CSV" hint="Needs an “email” column; name, company, phone, country and tags (separate several with ;) are optional."><Textarea rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder={TEMPLATE} className="font-mono text-[12px]" /></Field>
        <Field label="Where did these people agree to hear from you?" required hint="Recorded as the consent source, for example “Signed up at the Kigali expo, March 2026”."><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={100} /></Field>
        <Field label="Tags (optional)" hint="Comma-separated, added to every imported contact."><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="expo-2026, retail" /></Field>
        <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />I confirm these people gave permission to receive marketing email from Pesaa.</label>
        {error && <Flash tone="error">{error}</Flash>}
        {result && (
          <div className="rounded-xl border border-border bg-surface/40 p-4 text-[13px]" aria-live="polite">
            <p className="font-semibold text-foreground">{done ? `Imported ${done.new} contacts` : `${result.new} of ${result.rows} rows can be imported`}</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-muted"><li>New: {result.new}</li><li>Invalid or test addresses: {result.invalid}</li><li>Duplicates in file: {result.duplicate_in_file}</li><li>Already in contacts: {result.already_exists}</li><li>Suppressed (not re-subscribed): {result.suppressed}</li></ul>
            {result.problems.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-medium text-foreground">Skipped rows ({result.problems.length}{result.problems.length === 50 ? "+" : ""})</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[12px]">{result.problems.map((p) => <li key={p.row}>Row {p.row}: <span className="font-mono">{p.email || "(blank)"}</span> — {p.reason}</li>)}</ul></details>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
