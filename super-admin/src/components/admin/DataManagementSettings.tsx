"use client";

import { useEffect, useState } from "react";
import { useDmMe, useDmSaveSettings, useDmSettings } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { SaveBar, SettingRow } from "./settingsParts";

function Config({ saved, onDirtyChange }: { saved: boolean; onDirtyChange: (d: boolean) => void }) {
  const canEdit = !!useDmMe().data?.permissions.includes("data:approve");
  const save = useDmSaveSettings();
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = value !== saved;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const submit = async () => {
    setError(null); setDone(false);
    try { await save.mutateAsync(value); setDone(true); } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save the setting."); }
  };
  return (
    <>
      <SettingRow label="Require a second administrator to approve" hint="Off: the administrator who requested a data operation may approve and run it themselves (Approve & run). On: another administrator must approve, as before.">
        <Toggle checked={value} onChange={(v) => { setValue(v); setDone(false); }} label="Require a second administrator to approve" size="sm" disabled={!canEdit} />
      </SettingRow>
      {canEdit ? <SaveBar dirty={dirty} saving={save.isPending} saved={done} error={error} onSave={submit} />
        : <p className="pt-3 text-[12px] text-muted">Changing this needs the Approve operations permission.</p>}
      <p className="pt-3 text-[12px] text-muted">Either way, the reason, the typed business name and a fresh eligibility check are required before anything runs, and every approval is recorded, including when someone approved their own. Closing a business permanently (archive, then deletion) always needs a second administrator, whatever this says.</p>
    </>
  );
}

/** The one platform switch that decides whether Data Management needs two administrators. */
export function DataManagementSettings({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const q = useDmSettings();
  if (q.isError) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load these settings. They need a Data Management permission. <button onClick={() => void q.refetch()} className="font-semibold underline">Retry</button></p>;
  if (!q.data) return <PageLoader variant="compact" />;
  return <Config key={String(q.data.require_second_approver)} saved={q.data.require_second_approver} onDirtyChange={onDirtyChange} />;
}
