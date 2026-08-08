"use client";
import { useState } from "react";
import { Mail, Plus, Send, Eye, AlertTriangle, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { useEmails, useCreateEmail, useDeleteEmail } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const COLOR = "#0f766e";

const STATUS_OPTS = ["Sent", "Opened", "Bounced"];
const statusBadge: Record<string, string> = {
  Sent: "bg-blue-100 text-blue-700",
  Opened: "bg-emerald-100 text-emerald-700",
  Bounced: "bg-red-100 text-red-600",
};

const EMPTY_FORM = { recipient: "", subject: "", body: "" };
type FormState = typeof EMPTY_FORM;

export default function EmailsPage() {
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const emailsQ = useEmails(1, 500);
  const loading = emailsQ.isLoading;
  const emails = emailsQ.data?.items ?? [];

  const loadError = emailsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load emails" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createEmail = useCreateEmail();
  const deleteEmail = useDeleteEmail();
  const saving = createEmail.isPending;

  const byStatus = (s: string) => emails.filter((e) => e.status === s).length;
  const stats = [
    { label: "Total Emails", value: emails.length, icon: Mail, color: COLOR },
    { label: "Sent", value: byStatus("Sent"), icon: Send, color: "#0284c7" },
    { label: "Opened", value: byStatus("Opened"), icon: Eye, color: "#10b981" },
    { label: "Bounced", value: byStatus("Bounced"), icon: AlertTriangle, color: "#dc2626" },
  ];

  const displayed = emails.filter((e) => filter === "All" || e.status === filter);

  const closeDrawer = () => { setShowCompose(false); setForm(EMPTY_FORM); setFormError(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.recipient.trim() || !form.subject.trim()) return;
    const payload = { recipient: form.recipient.trim(), subject: form.subject.trim(), body: form.body.trim() || null, status: "Sent" };
    createEmail.mutate(payload, {
      onSuccess: () => { setError(null); closeDrawer(); },
      onError: (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to log email"),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this email record?")) return;
    deleteEmail.mutate(id, {
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete email"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Emails</h1>
          <p className="text-sm text-muted mt-0.5">{loading ? "Loading..." : `${emails.length} logged emails`}</p>
        </div>
        <Button color={COLOR} onClick={() => setShowCompose(true)}><Plus size={15} /> Compose</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {["All", ...STATUS_OPTS].map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${filter === t ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
            style={filter === t ? { backgroundColor: COLOR } : undefined}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-muted">
            <Loader2 size={18} className="animate-spin" /> Loading emails...
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-20 text-center">
            <Mail size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No emails yet</p>
            <p className="text-xs text-muted mt-1 mb-4">Log your first outbound email to build a history</p>
            <Button color={COLOR} size="sm" onClick={() => setShowCompose(true)}><Plus size={13} /> Compose</Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">To</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Subject</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((e) => (
                <tr key={e.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-muted" />
                      <span className="text-sm text-foreground">{e.recipient}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{e.subject}</td>
                  <td className="px-4 py-3 text-sm text-muted">{(e.sent_at ?? e.created_at)?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge[e.status] ?? "bg-surface text-muted"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(e.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={showCompose} onClose={closeDrawer}
        title="Compose Email" description="Log an outbound email" size="sm">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Recipient" required>
            <Input autoFocus type="email" value={form.recipient}
              onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
              placeholder="jean@example.com" />
          </Field>
          <Field label="Subject" required>
            <Input value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Follow-up on your order" />
          </Field>
          <Field label="Body">
            <Textarea rows={4} value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Message content..." />
          </Field>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Sending..." : "Send"}
            onCancel={closeDrawer}
            disabled={saving || !form.recipient.trim() || !form.subject.trim()}
            color={COLOR}
          />
        </form>
      </Drawer>
    </div>
  );
}
