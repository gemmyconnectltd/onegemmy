"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select } from "@/components/ui/Form";
import { useBranchPrices, useSetBranchVisibility } from "@/lib/api/hooks";

/** Products list bulk action: hide the selected products in one branch, or show them there again. Their branch prices are
 *  kept. Only branches this person may change are offered (the server checks the same). */
export function BranchVisibilityDrawer({ productIds, visible, onClose, onDone }: { productIds: string[]; visible: boolean; onClose: () => void; onDone: () => void }) {
  const branches = (useBranchPrices(1, 1, undefined, "all").data?.summary.branches ?? []).filter((b) => b.editable);
  const save = useSetBranchVisibility();
  const [branchId, setBranchId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const noun = `${productIds.length} product${productIds.length === 1 ? "" : "s"}`;
  const submit = async () => {
    setProblem(null);
    try {
      await save.mutateAsync({ product_ids: productIds, branch_id: branchId, visible });
      onDone();
    } catch (e) {
      setProblem((e as { detail?: string })?.detail ?? `The ${noun} could not be ${visible ? "shown" : "hidden"}. Try again.`);
    }
  };
  return (
    <Drawer open onClose={onClose} side="center" size="sm" title={visible ? "Show in branch" : "Hide in branch"}
      description={visible ? `Sell the ${noun} in a branch again, at their branch or default price.` : `Stop selling the ${noun} in one branch. Stock, prices and history are kept.`}>
      <div className="space-y-4 p-4 sm:p-5">
        <Field label="Branch" required>
          <Select aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Choose a branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {problem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!branchId} loading={save.isPending} onClick={() => void submit()}>{visible ? `Show ${noun}` : `Hide ${noun}`}</Button>
        </div>
      </div>
    </Drawer>
  );
}
