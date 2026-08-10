"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useCreateExpense } from "@/lib/api/hooks";
import { expenseCategories } from "@/lib/config";

export default function MobileNewExpensePage() {
  const router = useRouter();
  const { currencySymbol } = useMobilePos();
  const createExpense = useCreateExpense();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(expenseCategories[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = Number(amount);
    if (!title.trim() || !amount || !Number.isFinite(value) || value <= 0) {
      setError("Enter a title and a valid amount.");
      return;
    }
    setError(null);
    try {
      await createExpense.mutateAsync({
        title: title.trim(),
        amount: value,
        expense_date: date,
        category,
        notes: notes.trim() || null,
      });
      router.replace("/expenses");
    } catch (e) {
      setError((e as { detail?: string })?.detail ?? "Could not record the expense. Try again.");
    }
  };

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="New expense" subtitle="Record a business expense" />
      <div className="flex-1 px-4 pt-4 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Description</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Shop rent — August"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">
              Amount ({currencySymbol})
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[16px] font-bold font-mono text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1.5">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {expenseCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors ${
                    category === c
                      ? "bg-accent border-accent text-white"
                      : "border-border text-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">
              Notes <span className="normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember about this expense"
              rows={3}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        {error && <p className="text-[12px] text-red-500 font-medium px-1">{error}</p>}

        <button
          onClick={submit}
          disabled={createExpense.isPending}
          className="w-full py-3.5 rounded-2xl bg-accent text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {createExpense.isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Recording…
            </>
          ) : (
            "Save expense"
          )}
        </button>
      </div>
    </div>
  );
}
