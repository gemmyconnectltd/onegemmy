import { BUSINESS_TYPES } from "@/components/pos/catalog";
import type { BusinessType, SaleResult } from "@/components/pos/types";

const STORAGE_KEY = "onegemmy.sales.v1";
const UPDATED_EVENT = "onegemmy:sales-updated";

const EMPTY: SaleResult[] = [];

let salesCache: SaleResult[] | null = null;

type StoredBusiness = Pick<BusinessType, "id" | "label" | "accent">;

type StoredSale = Omit<SaleResult, "business" | "timestamp" | "paidAt"> & {
  business: StoredBusiness;
  timestamp: string;
  paid?: boolean;
  paidAt?: string | null;
};

function readStorage(): StoredSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSale[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(sales: StoredSale[]) {
  salesCache = null;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

function rehydrate(s: StoredSale): SaleResult {
  const full = BUSINESS_TYPES.find((b) => b.id === s.business.id);
  const business: BusinessType = full ?? {
    ...s.business,
    icon: "",
    tagline: "",
    categories: [],
    products: [],
  };
  return {
    ...s,
    business,
    timestamp: new Date(s.timestamp),
    paid: s.paid ?? false,
    paidAt: s.paidAt ?? null,
  };
}

export function saveSale(sale: SaleResult) {
  const sales = readStorage();
  const entry: StoredSale = {
    ...sale,
    business: { id: sale.business.id, label: sale.business.label, accent: sale.business.accent },
    timestamp: sale.timestamp.toISOString(),
    paid: false,
    paidAt: null,
  };
  writeStorage([entry, ...sales]);
}

export function getSales(): SaleResult[] {
  if (typeof window === "undefined") return EMPTY;
  if (salesCache) return salesCache;
  salesCache = readStorage()
    .map(rehydrate)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return salesCache;
}

export function getInvoices(): SaleResult[] {
  return getSales().filter((s) => s.isInvoice);
}

export function markInvoicePaid(id: string) {
  const sales = readStorage().map((s) =>
    s.invoiceNumber === id ? { ...s, paid: true, paidAt: new Date().toISOString() } : s
  );
  writeStorage(sales);
}

export function deleteSale(id: string) {
  writeStorage(readStorage().filter((s) => s.orderId !== id && s.invoiceNumber !== id));
}

export function subscribeSales(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    salesCache = null;
    callback();
  };
  window.addEventListener(UPDATED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const getSalesSnapshot = getSales;
