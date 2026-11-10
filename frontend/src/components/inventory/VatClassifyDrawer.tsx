"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select } from "@/components/ui/Form";
import { useClassifyProductVat } from "@/lib/api/hooks";
import { PRODUCT_VAT_OPTIONS, type ProductVatTreatment } from "@/lib/api/inventory";

/** Bulk VAT classification for the selected products. The server checks the tax permission and audits each change;
 *  sales already recorded keep the VAT they were sold with. */
export function VatClassifyDrawer({ productIds, onClose, onDone }: { productIds: string[]; onClose: () => void; onDone: () => void }) {
  const [treatment, setTreatment] = useState<ProductVatTreatment>("standard");
  const [taxCode, setTaxCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const classify = useClassifyProductVat();
  const needsReason = treatment !== "standard";
  const valid = productIds.length > 0 && (!needsReason || reason.trim().length > 0);
  const noun = productIds.length === 1 ? "product" : "products";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || classify.isPending) return;
    setError(null);
    try {
      await classify.mutateAsync({ product_ids: productIds, vat_treatment: treatment, tax_code: taxCode.trim() || null, vat_reason: reason.trim() || null });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the VAT treatment");
    }
  };

  return (
    <Drawer open onClose={onClose} title="Set VAT treatment" description={`${productIds.length} selected ${noun}`} size="md"
      footer={<form onSubmit={submit}><FormFooter submitLabel={classify.isPending ? "Saving…" : `Apply to ${productIds.length} ${noun}`} onCancel={onClose} disabled={!valid || classify.isPending} /></form>}>
      <div className="space-y-4 p-5">
        {error && <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3"><XCircle size={15} className="mt-0.5 flex-shrink-0 text-red-500" /><p className="text-sm font-medium text-red-700">{error}</p></div>}
        <Field label="Sales VAT treatment" required hint={PRODUCT_VAT_OPTIONS.find((o) => o.value === treatment)?.hint}>
          <Select value={treatment} onChange={(e) => setTreatment(e.target.value as ProductVatTreatment)}>
            {PRODUCT_VAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Tax code (optional)">
          <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} maxLength={30} placeholder="e.g. your EBM tax code" />
        </Field>
        <Field label={needsReason ? "Reason" : "Reason (optional)"} required={needsReason} hint="The legal basis, kept with each product's history.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
        </Field>
        <p className="text-xs text-muted">Only new sales use the new treatment. Sales already recorded keep the VAT they were sold with.</p>
      </div>
    </Drawer>
  );
}
