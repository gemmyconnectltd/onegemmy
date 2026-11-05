"use client";
import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { resolveUploadUrl } from "@/lib/api/client";
import { useAddGalleryImage, useMakeMainImage, useProductGallery, useRemoveGalleryImage } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const fail = (cause: unknown) => (cause as { detail?: string; message?: string })?.detail ?? (cause as { message?: string })?.message ?? "That didn't work. Please try again.";

/** The main picture plus extra pictures of a product. Choose any picture to make it the main one: the old main picture stays in the gallery. */
export function ProductGallery({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const q = useProductGallery(productId);
  const add = useAddGalleryImage();
  const remove = useRemoveGalleryImage();
  const main = useMakeMainImage();
  const { confirm, dialog } = useConfirmDialog();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = add.isPending || remove.isPending || main.isPending;
  const onError = (e: unknown) => setProblem(fail(e));

  function pick(files: FileList | null) {
    setProblem(null);
    const file = files?.[0];
    if (!file) return;
    if (!TYPES.includes(file.type)) return setProblem("Only JPEG, PNG and WebP pictures are allowed.");
    if (file.size > 5 * 1024 * 1024) return setProblem("A picture must be under 5MB.");
    add.mutate({ id: productId, file }, { onError });
    if (input.current) input.current.value = "";
  }
  const gallery = q.data?.gallery ?? [];
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Product pictures">
      {dialog}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="pesaa-card-title">Pictures</h2>
        {canEdit && <><input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" aria-label="Add a picture" onChange={(e) => pick(e.target.files)} />
          <Button variant="outline" size="sm" disabled={busy || gallery.length >= 8} onClick={() => input.current?.click()}><ImagePlus size={14} aria-hidden /> {add.isPending ? "Adding…" : "Add a picture"}</Button></>}
      </div>
      {problem && <p role="alert" className="mb-2 text-xs text-red-600">{problem}</p>}
      <ul className="flex flex-wrap gap-3">
        {q.data?.main && <li className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-accent" title="Main picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveUploadUrl(q.data.main) ?? ""} alt="Main picture" className="h-full w-full object-cover" />
          <span className="absolute bottom-0 left-0 right-0 bg-accent/90 py-0.5 text-center text-[10px] font-semibold text-white">Main</span></li>}
        {gallery.map((g, i) => (
          <li key={g.id} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveUploadUrl(g.url) ?? ""} alt={`Picture ${i + 1}`} className="h-full w-full object-cover" />
            {canEdit && <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/60 p-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <button type="button" disabled={busy} aria-label={`Make picture ${i + 1} the main picture`} title="Make main" className="rounded p-1 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white" onClick={() => main.mutate({ id: productId, imageId: g.id }, { onError })}><Star size={14} /></button>
              <button type="button" disabled={busy} aria-label={`Remove picture ${i + 1}`} title="Remove" className="rounded p-1 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white" onClick={() => confirm({ title: "Remove this picture?", message: "It is deleted from the product.", confirmLabel: "Remove", danger: true, onConfirm: () => remove.mutate({ id: productId, imageId: g.id }, { onError }) })}><Trash2 size={14} /></button>
            </div>}
          </li>))}
      </ul>
      {!q.data?.main && gallery.length === 0 && <p className="text-sm text-muted">No pictures yet.</p>}
    </section>
  );
}
