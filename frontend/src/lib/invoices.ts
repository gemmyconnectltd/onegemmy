import type { SaleResult } from "@/components/pos/types";

const STORAGE_KEY = "onegemmy.sales.v1";
const UPDATED_EVENT = "onegemmy:sales-updated";

const EMPTY: SaleResult[] = [];
let salesCache: SaleResult[] | null = null;

type StoredSale = Omit<SaleResult, "timestamp"> & {
  timestamp: string;
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
  return {
    ...s,
    timestamp: new Date(s.timestamp),
    discount: s.discount ?? 0,
    notes: s.notes ?? "",
  };
}

export function saveSale(sale: SaleResult) {
  const sales = readStorage();
  const entry: StoredSale = {
    ...sale,
    timestamp: sale.timestamp.toISOString(),
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

export function deleteSale(id: string) {
  writeStorage(readStorage().filter((s) => s.orderId !== id));
}

export function subscribeSales(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => { salesCache = null; callback(); };
  window.addEventListener(UPDATED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const getSalesSnapshot = getSales;
