export interface PurchaseItem {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit_cost: number;
}

export interface PurchaseResult {
  id: string;
  supplierId: string | null;
  supplierName: string;
  items: PurchaseItem[];
  total: number;
  notes: string;
  timestamp: Date;
}

const STORAGE_KEY = "onegemmy.purchases.v1";
const UPDATED_EVENT = "onegemmy:purchases-updated";

const EMPTY: PurchaseResult[] = [];
let purchasesCache: PurchaseResult[] | null = null;

type StoredPurchase = Omit<PurchaseResult, "timestamp"> & {
  timestamp: string;
};

function readStorage(): StoredPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPurchase[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(purchases: StoredPurchase[]) {
  purchasesCache = null;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(purchases));
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

function rehydrate(p: StoredPurchase): PurchaseResult {
  return {
    ...p,
    timestamp: new Date(p.timestamp),
    notes: p.notes ?? "",
  };
}

export function savePurchase(purchase: PurchaseResult) {
  const purchases = readStorage();
  const entry: StoredPurchase = {
    ...purchase,
    timestamp: purchase.timestamp.toISOString(),
  };
  writeStorage([entry, ...purchases]);
}

export function getPurchases(): PurchaseResult[] {
  if (typeof window === "undefined") return EMPTY;
  if (purchasesCache) return purchasesCache;
  purchasesCache = readStorage()
    .map(rehydrate)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return purchasesCache;
}

export function deletePurchase(id: string) {
  writeStorage(readStorage().filter((p) => p.id !== id));
}

export function subscribePurchases(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    purchasesCache = null;
    callback();
  };
  window.addEventListener(UPDATED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
