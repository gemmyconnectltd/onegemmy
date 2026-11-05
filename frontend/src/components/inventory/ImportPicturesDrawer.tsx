"use client";
import { useRef, useState } from "react";
import { FileArchive } from "lucide-react";
import type { PictureImportResult } from "@/lib/api";
import { useImportProductPictures } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { FormErrorSummary } from "@/components/ui/FormKit";

/** Attach many product pictures at once: a ZIP of image files named after each product's SKU or barcode (PN0333.jpg). */
export function ImportPicturesDrawer({ onClose, initialResult = null }: { onClose: () => void; initialResult?: PictureImportResult | null }) {
  const run = useImportProductPictures();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PictureImportResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!file) return;
    setError(null); setResult(null);
    try { setResult((await run.mutateAsync(file)).data); }
    catch (cause) { setError((cause as { detail?: string; message?: string })?.detail ?? (cause as { message?: string })?.message ?? "The pictures could not be imported."); }
  }
  return (
    <Drawer open onClose={() => !run.isPending && onClose()} size="lg" title="Import product pictures" description="Add pictures to many products at once.">
      <div className="space-y-4 p-4 sm:p-5">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Name each picture after the product&apos;s <strong className="text-foreground">SKU or barcode</strong>, for example <code>PN0333.jpg</code> or <code>6001234567890.png</code>.</li>
          <li>Put the pictures in one ZIP file (JPEG, PNG or WebP, up to 5MB each, up to 300 pictures).</li>
          <li>Choose the ZIP below. Pictures that match replace the product&apos;s main picture; the rest are listed with the reason.</li>
        </ol>
        <p className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-muted"><strong className="text-foreground">Pictures pasted into your Excel sheet?</strong> Import the products first, then choose the same <code>.xlsx</code> file here. Each picture goes to the product on its row: the first (leftmost) picture is the main one and any others become extra pictures.</p>
        <FormErrorSummary errors={error} />
        <input ref={input} type="file" accept=".zip,.xlsx,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="ZIP or Excel file with pictures" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={run.isPending}><FileArchive size={15} aria-hidden /> {file ? "Choose another file" : "Choose ZIP or Excel file"}</Button>
          {file && <span className="min-w-0 truncate text-sm">{file.name} <span className="text-muted">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>}
          <Button className="ml-auto" disabled={!file || run.isPending} onClick={() => void send()}>{run.isPending ? "Importing…" : "Import pictures"}</Button>
        </div>
        {result && (
          <div className="space-y-3" role="status">
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">{result.source === "excel"
              ? <><strong>{result.total_pictures ?? result.matched}</strong> picture{(result.total_pictures ?? result.matched) === 1 ? "" : "s"} attached to <strong>{result.matched}</strong> product{result.matched === 1 ? "" : "s"}{result.extra_pictures ? `, including ${result.extra_pictures} extra picture${result.extra_pictures === 1 ? "" : "s"}` : ""}{result.skipped ? `. ${result.skipped} row${result.skipped === 1 ? "" : "s"} need a look` : ""}.</>
              : <><strong>{result.matched}</strong> picture{result.matched === 1 ? "" : "s"} attached{result.skipped ? `, ${result.skipped} skipped` : ""}.</>}</p>
            {result.problems.length > 0 && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted">Skipped</p>
                <ul className="max-h-60 divide-y divide-border overflow-auto text-sm">{result.problems.map((p, i) => <li key={`${p.file}${i}`} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="break-all font-medium">{p.file}</span><span className="text-muted">{p.reason}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
