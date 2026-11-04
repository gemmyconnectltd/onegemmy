"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { CategoriesManager } from "@/components/inventory/CategoriesManager";
import { BrandsManager } from "@/components/inventory/BrandsManager";
import { UnitsManager } from "@/components/inventory/UnitsManager";

type SettingsTab = "categories" | "brands" | "units";

const TABS: { key: SettingsTab; label: string; description: string }[] = [
  { key: "categories", label: "Categories", description: "Group products for browsing, filters and reports." },
  { key: "brands", label: "Brands", description: "Track manufacturers and private labels." },
  { key: "units", label: "Units", description: "Units of measure used on products and stock." },
];

function ProductSettingsContent() {
  const params = useSearchParams();
  const initial = (["categories", "brands", "units"].includes(params.get("tab") || "")
    ? params.get("tab")
    : "categories") as SettingsTab;
  const [tab, setTab] = useState<SettingsTab>(initial);

  useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== "categories") next.set("tab", tab);
    const query = next.toString();
    window.history.replaceState(null, "", `/inventory/products/settings${query ? `?${query}` : ""}`);
  }, [tab]);

  const active = TABS.find((item) => item.key === tab) ?? TABS[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link href="/inventory/products" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-foreground">
            <ArrowLeft size={16} /> Back to products
          </Link>
          <div>
            <h1 className="pesaa-page-title">Product settings</h1>
            <p className="mt-0.5 text-sm text-muted">
              Manage categories, brands and units used across your catalog. Permissions and records are unchanged.
            </p>
          </div>
        </div>
        <Link href="/inventory/products">
          <Button variant="secondary">Open products</Button>
        </Link>
      </div>

      <div role="tablist" aria-label="Product attributes" className="flex gap-4 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-semibold ${
              tab === item.key ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">{active.description}</p>

      {tab === "categories" && <CategoriesManager embedded />}
      {tab === "brands" && <BrandsManager embedded />}
      {tab === "units" && <UnitsManager embedded />}
    </div>
  );
}

export default function ProductSettingsPage() {
  return (
    <Suspense fallback={<PageLoader variant="page" />}>
      <ProductSettingsContent />
    </Suspense>
  );
}
