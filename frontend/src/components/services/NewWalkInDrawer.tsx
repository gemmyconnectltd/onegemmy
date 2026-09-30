"use client";

import { useMemo, useState } from "react";
import { User } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { useCreateQueueEntry, useAllServices, useEmployees, useCustomers } from "@/lib/api/hooks";

export function NewWalkInDrawer({ open, onClose, color }: { open: boolean; onClose: () => void; color: string }) {
  const { data: services } = useAllServices();
  const { data: empData } = useEmployees("Active");
  const employees = empData?.items ?? [];
  const { data: custData } = useCustomers(1, 200);
  const createQueueEntry = useCreateQueueEntry();

  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredCustomers = useMemo(
    () => customerQuery ? (custData?.items ?? []).filter((c) => c.name.toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 6) : [],
    [custData, customerQuery],
  );

  function reset() {
    setCustomerQuery(""); setSelectedCustomerId(""); setCustomerName("");
    setServiceId(""); setEmployeeId(""); setError(null);
  }

  async function submit(startNow: boolean) {
    setError(null);
    try {
      await createQueueEntry.mutateAsync({
        customer_id: selectedCustomerId || null,
        customer_name: customerName.trim(),
        service_id: serviceId,
        employee_id: employeeId || null,
        start_now: startNow,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to queue.");
    }
  }

  const canSubmit = customerName.trim().length > 0 && !!serviceId;

  return (
    <Drawer open={open} onClose={() => { onClose(); }} title="New Walk-in" description="Add a customer to the queue">
      <div className="space-y-4 p-5">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <Field label="Customer" required>
          <div className="relative">
            <Input required value={selectedCustomerId ? customerName : customerQuery}
              onChange={(e) => { setSelectedCustomerId(""); setCustomerQuery(e.target.value); setCustomerName(e.target.value); }}
              placeholder="Search or type a guest name" />
            {!selectedCustomerId && filteredCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {filteredCustomers.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedCustomerId(c.id); setCustomerName(c.name); setCustomerQuery(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface transition-colors flex items-center gap-2">
                    <User size={13} className="text-muted" /> {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Service" required>
          <Select required value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">Select a service…</option>
            {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>)}
          </Select>
        </Field>

        <Field label="Staff" hint="Leave unassigned to assign later from the queue">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Auto / assign later</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => { reset(); onClose(); }} className="rounded-lg text-[13px]">
            Cancel
          </Button>
          <Button type="button" onClick={() => submit(false)} disabled={createQueueEntry.isPending || !canSubmit} variant="secondary" className="flex-1 rounded-lg text-[13px] font-bold">
            Add to Queue
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={createQueueEntry.isPending || !canSubmit || !employeeId} color={color} className="flex-1 rounded-lg text-[13px] font-bold">
            Start Now
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
