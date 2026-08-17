// IndexedDB layer for offline-first storage. No external dependency.
//
// All caches use the same "id" key path so records can be upserted and
// looked up without a schema. Writes are full-transaction replaces/puts so
// a crash mid-write never leaves a half-applied store.

const DB_NAME = "onegemmy";
const DB_VERSION = 1;

export const CACHE_STORES = [
  "products",
  "customers",
  "suppliers",
  "orders",
  "expenses",
  "categories",
  "purchases",
  "pendingOps",
] as const;

export type CacheStore = (typeof CACHE_STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of CACHE_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function toRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

// ── reads ─────────────────────────────────────────────────────────────────────

export async function getAll<T>(store: CacheStore): Promise<T[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return toRequest(db.transaction(store, "readonly").objectStore(store).getAll());
}

export async function getItem<T>(store: CacheStore, id: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const value = await toRequest(db.transaction(store, "readonly").objectStore(store).get(id));
  return (value as T | undefined) ?? null;
}

export async function count(store: CacheStore): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openDb();
  return toRequest(db.transaction(store, "readonly").objectStore(store).count());
}

// ── writes ────────────────────────────────────────────────────────────────────

export async function put<T>(store: CacheStore, item: T): Promise<void> {
  if (typeof indexedDB === "undefined" || !item) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(item);
  await txDone(tx);
}

export async function putAll<T>(store: CacheStore, items: T[]): Promise<void> {
  if (typeof indexedDB === "undefined" || items.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const item of items) os.put(item);
  await txDone(tx);
}

// Replace the whole store contents in one transaction (used for full-list
// cache refreshes so deleted records don't linger).
export async function replaceAll<T>(store: CacheStore, items: T[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  os.clear();
  for (const item of items) os.put(item);
  await txDone(tx);
}

export async function del(store: CacheStore, id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function clearStore(store: CacheStore): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

// Wipe every data store (used on logout / tenant switch).
export async function clearAllStores(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(CACHE_STORES, "readwrite");
  for (const store of CACHE_STORES) tx.objectStore(store).clear();
  await txDone(tx);
}
