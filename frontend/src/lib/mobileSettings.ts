export interface MobileSettings {
  businessName: string;
  phone: string;
  address: string;
  taxOnReceipt: boolean;
  notifyLowStock: boolean;
  notifyDaily: boolean;
  receiptWidth: "80mm" | "58mm";
  receiptCopies: number;
  printerBluetooth: boolean;
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  businessName: "",
  phone: "",
  address: "",
  taxOnReceipt: true,
  notifyLowStock: true,
  notifyDaily: true,
  receiptWidth: "80mm",
  receiptCopies: 1,
  printerBluetooth: false,
};

const STORAGE_KEY = "onegemmy.mobile.settings.v1";
const UPDATED_EVENT = "onegemmy:settings-updated";

export function loadMobileSettings(): MobileSettings {
  if (typeof window === "undefined") return DEFAULT_MOBILE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_MOBILE_SETTINGS, ...(JSON.parse(raw) as Partial<MobileSettings>) } : DEFAULT_MOBILE_SETTINGS;
  } catch {
    return DEFAULT_MOBILE_SETTINGS;
  }
}

export function saveMobileSettings(patch: Partial<MobileSettings>): MobileSettings {
  const next = { ...loadMobileSettings(), ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
  return next;
}

export function subscribeMobileSettings(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => callback();
  window.addEventListener(UPDATED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UPDATED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
