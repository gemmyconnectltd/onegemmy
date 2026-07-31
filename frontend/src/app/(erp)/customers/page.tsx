"use client";

import { useState } from "react";
import { Plus, Search, Phone, Mail, ShoppingCart } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, FormFooter } from "@/components/ui/Form";

interface Purchase {
  date: string;
  items: string;
  total: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalPurchases: number;
  lastPurchaseAt: string;
  purchases: Purchase[];
}

const initialCustomers: Customer[] = [
  {
    id: "1",
    name: "Jean Pierre",
    phone: "+250 788 123 456",
    email: "jean@example.com",
    totalPurchases: 125000,
    lastPurchaseAt: "2025-07-24",
    purchases: [
      { date: "2025-07-24", items: "Phone Case x2", total: 10000 },
      { date: "2025-07-20", items: "USB Cable x3", total: 9000 },
      { date: "2025-07-15", items: "Screen Protector x1", total: 2000 },
    ],
  },
  {
    id: "2",
    name: "Marie Claire",
    phone: "+250 788 234 567",
    email: null,
    totalPurchases: 87000,
    lastPurchaseAt: "2025-07-23",
    purchases: [
      { date: "2025-07-23", items: "Wireless Earbuds x1", total: 15000 },
      { date: "2025-07-10", items: "Phone Charger x2", total: 16000 },
    ],
  },
  {
    id: "3",
    name: "Patrick Niyonzima",
    phone: "+250 788 345 678",
    email: "patrick@example.com",
    totalPurchases: 234000,
    lastPurchaseAt: "2025-07-22",
    purchases: [
      { date: "2025-07-22", items: "Bluetooth Speaker x1", total: 25000 },
    ],
  },
  {
    id: "4",
    name: "Immaculate",
    phone: "+250 788 456 789",
    email: null,
    totalPurchases: 45000,
    lastPurchaseAt: "2025-07-18",
    purchases: [],
  },
  {
    id: "5",
    name: "Eric Habimana",
    phone: "+250 788 567 890",
    email: null,
    totalPurchases: 67000,
    lastPurchaseAt: "2025-07-15",
    purchases: [],
  },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const customer: Customer = {
      id: String(Date.now()),
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim() || null,
      totalPurchases: 0,
      lastPurchaseAt: "",
      purchases: [],
    };
    setCustomers((prev) => [customer, ...prev]);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setShowAddForm(false);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted mt-0.5">{customers.length} customers</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="bg-card border border-border p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Phone</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Total Purchases</th>
              <th className="p-3 font-medium">Last Purchase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((customer) => (
              <tr
                key={customer.id}
                onClick={() => setSelectedCustomer(selectedCustomer?.id === customer.id ? null : customer)}
                className="hover:bg-surface/50 transition-colors cursor-pointer"
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {customer.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm font-medium text-foreground">{customer.name}</span>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 text-sm text-foreground/70">
                    <Phone size={12} className="text-muted" />
                    {customer.phone}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted">
                    <Mail size={12} />
                    {customer.email || "—"}
                  </div>
                </td>
                <td className="p-3 text-sm font-medium text-foreground">
                  {CURRENCY_SYMBOL} {customer.totalPurchases.toLocaleString()}
                </td>
                <td className="p-3 text-xs text-muted">
                  {customer.lastPurchaseAt || "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Purchase History */}
      {selectedCustomer && selectedCustomer.purchases.length > 0 && (
        <div className="bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Purchase History — {selectedCustomer.name}
            </h2>
          </div>
          <div className="border border-border">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border">
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Items</th>
                  <th className="p-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedCustomer.purchases.map((purchase, i) => (
                  <tr key={i} className="hover:bg-surface/50">
                    <td className="p-3 text-sm text-foreground/70">{purchase.date}</td>
                    <td className="p-3 text-sm text-foreground">{purchase.items}</td>
                    <td className="p-3 text-sm font-medium text-foreground text-right">
                      {CURRENCY_SYMBOL} {purchase.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Drawer
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        title="Add Customer"
        description="Save a customer so you can track their purchases."
        side="right"
        footer={
          <form onSubmit={handleAddCustomer}>
            <FormFooter submitLabel="Add Customer" onCancel={() => setShowAddForm(false)} disabled={!newName.trim() || !newPhone.trim()} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <Field label="Name" required>
            <Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jean Pierre" autoFocus />
          </Field>
          <Field label="Phone" required>
            <Input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="e.g. +250 788 123 456" />
          </Field>
          <Field label="Email" hint="Optional">
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="e.g. jean@example.com" />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
