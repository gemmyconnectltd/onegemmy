import { Plus, Contact, Mail, Phone, Building2 } from "lucide-react";

const contacts = [
  { name: "Alice Johnson", email: "alice@acme.com", phone: "+1 555-0101", company: "Acme Corp", status: "Active", lastContact: "2 days ago" },
  { name: "Bob Williams", email: "bob@beta.com", phone: "+1 555-0102", company: "Beta LLC", status: "Active", lastContact: "1 week ago" },
  { name: "Charlie Brown", email: "charlie@charlie.com", phone: "+1 555-0103", company: "Charlie Inc", status: "Lead", lastContact: "3 days ago" },
  { name: "Diana Ross", email: "diana@delta.com", phone: "+1 555-0104", company: "Delta Co", status: "Active", lastContact: "5 days ago" },
  { name: "Edward Davis", email: "edward@echo.com", phone: "+1 555-0105", company: "Echo Ltd", status: "Inactive", lastContact: "2 months ago" },
];

export default function CRMPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM</h1>
          <p className="text-sm text-muted mt-1">Manage your contacts and relationships</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={16} />
          Add Contact
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Contacts", value: "342", icon: Contact, color: "text-primary" },
          { label: "Active", value: "218", icon: Contact, color: "text-emerald-600" },
          { label: "Leads", value: "84", icon: Contact, color: "text-secondary" },
          { label: "Companies", value: "56", icon: Building2, color: "text-accent" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        <div className="p-5 border-b border-border">
          <h2 className="font-bold text-foreground">Contacts</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Phone</th>
              <th className="p-4 font-medium">Company</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Last Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.map((contact, i) => (
              <tr key={i} className="hover:bg-surface/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground">
                      {contact.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <span className="text-sm font-medium text-foreground">{contact.name}</span>
                  </div>
                </td>
                <td className="p-4 text-sm text-muted">{contact.email}</td>
                <td className="p-4 text-sm text-foreground/70">{contact.phone}</td>
                <td className="p-4 text-sm text-foreground/70">{contact.company}</td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    contact.status === "Active" ? "bg-emerald-50 text-emerald-600" :
                    contact.status === "Lead" ? "bg-foreground/10 text-foreground" :
                    "bg-surface text-muted"
                  }`}>
                    {contact.status}
                  </span>
                </td>
                <td className="p-4 text-sm text-muted">{contact.lastContact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
