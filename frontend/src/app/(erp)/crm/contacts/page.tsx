"use client";
import { Plus, Phone, Mail } from "lucide-react";

const contacts = [
  { id: 1, name: "Jean Pierre",   company: "Acme Corp",  email: "jean@acme.com",   phone: "+250 788 123 456", stage: "Negotiation" },
  { id: 2, name: "Marie Claire",  company: "Beta LLC",   email: "marie@beta.com",  phone: "+250 788 234 567", stage: "Proposal" },
  { id: 3, name: "Patrick N.",    company: "Charlie Inc",email: "pat@charlie.com", phone: "+250 788 345 678", stage: "Qualified" },
  { id: 4, name: "Immaculate K.", company: "Delta Co",   email: "imm@delta.com",   phone: "+250 788 456 789", stage: "Closed Won" },
];

const stageColor: Record<string, string> = {
  "Negotiation": "bg-amber-50 text-amber-700",
  "Proposal":    "bg-blue-50 text-blue-700",
  "Qualified":   "bg-purple-50 text-purple-700",
  "Closed Won":  "bg-emerald-50 text-emerald-700",
};

export default function ContactsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Add Contact</button>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Name</th><th className="p-4 font-medium">Company</th><th className="p-4 font-medium">Email</th><th className="p-4 font-medium">Phone</th><th className="p-4 font-medium">Stage</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{c.name.split(" ").map((n)=>n[0]).join("").slice(0,2)}</div>
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                </div></td>
                <td className="p-4 text-sm text-muted">{c.company}</td>
                <td className="p-4"><div className="flex items-center gap-1.5 text-sm text-muted"><Mail size={12} />{c.email}</div></td>
                <td className="p-4"><div className="flex items-center gap-1.5 text-sm text-muted"><Phone size={12} />{c.phone}</div></td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${stageColor[c.stage]}`}>{c.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
