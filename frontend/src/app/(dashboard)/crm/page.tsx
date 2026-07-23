"use client";

import { useState } from "react";
import { Plus, Search, Mail, Phone, Building2, Grid3X3, List, MoreHorizontal, Star, MapPin } from "lucide-react";

const contacts = [
  { name: "Alice Johnson", email: "alice@acme.com", phone: "+1 555-0101", company: "Acme Corp", status: "Customer", role: "CEO", location: "New York", tags: ["Enterprise", "VIP"], lastContact: "2 days ago", avatar: "AJ" },
  { name: "Bob Williams", email: "bob@beta.com", phone: "+1 555-0102", company: "Beta LLC", status: "Lead", role: "CTO", location: "San Francisco", tags: ["SaaS"], lastContact: "1 week ago", avatar: "BW" },
  { name: "Charlie Brown", email: "charlie@charlie.com", phone: "+1 555-0103", company: "Charlie Inc", status: "Lead", role: "Director", location: "London", tags: ["Startup"], lastContact: "3 days ago", avatar: "CB" },
  { name: "Diana Ross", email: "diana@delta.com", phone: "+1 555-0104", company: "Delta Co", status: "Customer", role: "VP Sales", location: "Chicago", tags: ["Enterprise"], lastContact: "5 days ago", avatar: "DR" },
  { name: "Edward Davis", email: "edward@echo.com", phone: "+1 555-0105", company: "Echo Ltd", status: "Churned", role: "Manager", location: "Austin", tags: ["SMB"], lastContact: "2 months ago", avatar: "ED" },
  { name: "Fiona Green", email: "fiona@foxtrot.com", phone: "+1 555-0106", company: "Foxtrot Inc", status: "Customer", role: "Founder", location: "Seattle", tags: ["Enterprise", "VIP"], lastContact: "1 day ago", avatar: "FG" },
  { name: "George Hall", email: "george@golf.com", phone: "+1 555-0107", company: "Golf Partners", status: "Lead", role: "Partner", location: "Miami", tags: ["Agency"], lastContact: "4 days ago", avatar: "GH" },
  { name: "Hannah White", email: "hannah@hotel.com", phone: "+1 555-0108", company: "Hotel Group", status: "Customer", role: "COO", location: "Los Angeles", tags: ["Enterprise"], lastContact: "Today", avatar: "HW" },
];

const statusColors: Record<string, string> = {
  Customer: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Lead: "bg-primary/10 text-primary border border-primary/20",
  Churned: "bg-surface text-muted border border-border",
};

const tagColors: Record<string, string> = {
  Enterprise: "bg-foreground/5 text-foreground/70",
  VIP: "bg-amber-50 text-amber-700",
  SaaS: "bg-blue-50 text-blue-700",
  Startup: "bg-purple-50 text-purple-700",
  SMB: "bg-teal-50 text-teal-700",
  Agency: "bg-rose-50 text-rose-700",
};

export default function CRMPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted mt-0.5">{contacts.length} contacts</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={16} />
          New Contact
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-border p-3 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <div className="flex border border-border">
          <button
            onClick={() => setView("grid")}
            className={`p-2 ${view === "grid" ? "bg-foreground/5 text-foreground" : "text-muted hover:text-foreground"}`}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-2 ${view === "list" ? "bg-foreground/5 text-foreground" : "text-muted hover:text-foreground"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((contact, i) => (
            <div key={i} className="bg-white border border-border p-4 hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {contact.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{contact.name}</p>
                    <p className="text-xs text-muted">{contact.role}</p>
                  </div>
                </div>
                <button className="text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal size={16} />
                </button>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Building2 size={12} />
                  {contact.company}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Mail size={12} />
                  {contact.email}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Phone size={12} />
                  {contact.phone}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <MapPin size={12} />
                  {contact.location}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex gap-1.5">
                  {contact.tags.map((tag) => (
                    <span key={tag} className={`text-[10px] px-1.5 py-0.5 font-medium ${tagColors[tag] || "bg-surface text-muted"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 ${statusColors[contact.status] || "bg-surface text-muted"}`}>
                  {contact.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-white border border-border">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Company</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Phone</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last Contact</th>
                <th className="p-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((contact, i) => (
                <tr key={i} className="hover:bg-surface/50 transition-colors cursor-pointer">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {contact.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{contact.name}</p>
                        <p className="text-xs text-muted">{contact.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-foreground/70">{contact.company}</td>
                  <td className="p-3 text-sm text-muted">{contact.email}</td>
                  <td className="p-3 text-sm text-foreground/70">{contact.phone}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 ${statusColors[contact.status] || "bg-surface text-muted"}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted">{contact.lastContact}</td>
                  <td className="p-3">
                    <button className="text-muted hover:text-foreground">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
