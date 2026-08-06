"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { useCreateSupplier } from "@/lib/api/hooks";

export default function MobileNewSupplierPage() {
  const router = useRouter();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError("Enter a supplier name.");
      return;
    }
    setError(null);
    try {
      await createSupplier.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_active: true,
      });
      router.replace("/m/suppliers");
    } catch (e) {
      setError((e as { detail?: string })?.detail ?? "Could not save the supplier. Try again.");
    }
  };

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="New supplier" subtitle="Add a supplier to your records" />
      <div className="flex-1 px-4 pt-4 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. East Africa Traders"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              inputMode="tel"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supplier@example.com"
              inputMode="email"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Warehouse or office address"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
        </div>

        {error && <p className="text-[12px] text-red-500 font-medium px-1">{error}</p>}

        <button
          onClick={submit}
          disabled={createSupplier.isPending}
          className="w-full py-3.5 rounded-2xl bg-accent text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {createSupplier.isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Saving…
            </>
          ) : (
            "Save supplier"
          )}
        </button>
      </div>
    </div>
  );
}
