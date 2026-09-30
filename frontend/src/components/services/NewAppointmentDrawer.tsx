"use client";

import { useMemo, useState } from "react";
import { Sparkles, User } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { useAppointments, useCreateAppointment, useAllServices, useEmployees, useCustomers } from "@/lib/api/hooks";

export function NewAppointmentDrawer({ open, onClose, defaultDate, color }: { open: boolean; onClose: () => void; defaultDate: string; color: string }) {
  const { data: services } = useAllServices();
  const { data: empData } = useEmployees("Active");
  const employees = empData?.items ?? [];
  const { data: custData } = useCustomers(1, 200);
  const createAppointment = useCreateAppointment();

  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const scheduledStart = `${defaultDate}T${time}:00`;
  const totalMinutes = (services ?? []).filter((s) => serviceIds.includes(s.id)).reduce((sum, s) => sum + s.duration_minutes, 0);

  const dayStart = `${defaultDate}T00:00:00`;
  const dayEnd = `${defaultDate}T23:59:59`;
  const { data: dayAppointments } = useAppointments(1, 200, { dateFrom: dayStart, dateTo: dayEnd }, { enabled: open });

  function availabilityFor(empId: string): "available" | "busy" {
    if (totalMinutes === 0 || !dayAppointments) return "available";
    const start = new Date(scheduledStart);
    const end = new Date(start.getTime() + totalMinutes * 60000);
    const overlap = (dayAppointments.items ?? []).some((a) => {
      if (a.employee_id !== empId || ["cancelled", "no_show"].includes(a.status)) return false;
      const aStart = new Date(a.scheduled_start);
      const aEnd = new Date(a.scheduled_end);
      return aStart < end && aEnd > start;
    });
    return overlap ? "busy" : "available";
  }

  const filteredCustomers = useMemo(
    () => customerQuery ? (custData?.items ?? []).filter((c) => c.name.toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 6) : [],
    [custData, customerQuery],
  );

  function reset() {
    setCustomerQuery(""); setSelectedCustomerId(""); setCustomerName(""); setCustomerPhone("");
    setServiceIds([]); setEmployeeId(""); setTime("09:00"); setNotes(""); setError(null);
  }

  function toggleService(id: string) {
    setServiceIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await createAppointment.mutateAsync({
        customer_id: selectedCustomerId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        employee_id: employeeId || null,
        scheduled_start: scheduledStart,
        services: serviceIds.map((id) => ({ service_id: id })),
        notes: notes.trim() || null,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book this appointment.");
    }
  }

  return (
    <Drawer open={open} onClose={() => { onClose(); }} title="New Appointment" description="Book a service for a customer">
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <Field label="Customer" required>
          <div className="relative">
            <Input required value={selectedCustomerId ? customerName : customerQuery}
              onChange={(e) => { setSelectedCustomerId(""); setCustomerQuery(e.target.value); setCustomerName(e.target.value); }}
              placeholder="Search or type a new customer name" />
            {!selectedCustomerId && filteredCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {filteredCustomers.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone ?? ""); setCustomerQuery(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface transition-colors flex items-center gap-2">
                    <User size={13} className="text-muted" /> {c.name} {c.phone && <span className="text-muted text-xs">· {c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
        <Field label="Phone">
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Services" required hint={totalMinutes > 0 ? `Total duration: ${totalMinutes} min` : undefined}>
          <div className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
            {(services ?? []).map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface/50">
                <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} className="w-4 h-4 rounded" />
                <Sparkles size={12} className="text-muted shrink-0" />
                <span className="flex-1 text-foreground">{s.name}</span>
                <span className="text-xs text-muted">{s.duration_minutes} min</span>
              </label>
            ))}
            {(services ?? []).length === 0 && <p className="px-3 py-4 text-sm text-muted text-center">No active services in your catalog yet.</p>}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Time" required>
            <Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Staff">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Unassigned</option>
              {employees.map((e) => {
                const avail = availabilityFor(e.id);
                return <option key={e.id} value={e.id}>{e.full_name} {avail === "busy" ? "— Busy" : ""}</option>;
              })}
            </Select>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        <FormFooter
          submitLabel={createAppointment.isPending ? "Booking…" : "Book Appointment"}
          onCancel={() => { reset(); onClose(); }}
          disabled={createAppointment.isPending || !customerName.trim() || serviceIds.length === 0}
          color={color}
        />
      </form>
    </Drawer>
  );
}
