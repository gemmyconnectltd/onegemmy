export interface StockMovement {
  id: string;
  productName: string;
  qty: number;
  reason: string;
  timestamp: string;
}

const STORAGE_KEY = "onegemmy.movements.v1";
const UPDATED_EVENT = "onegemmy:movements-updated";

export function getStockMovements(): StockMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StockMovement[]) : [];
  } catch {
    return [];
  }
}

export function addStockMovement(m: Omit<StockMovement, "id" | "timestamp">): StockMovement {
  const next: StockMovement = {
    ...m,
    id: `mv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const list = [next, ...getStockMovements()].slice(0, 300);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
  return next;
}

export function subscribeStockMovements(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => callback();
  window.addEventListener(UPDATED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
