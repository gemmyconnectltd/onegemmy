import { saveFile } from "@/lib/api/client";

/** iPhone and iPad (including iPads that report themselves as a Mac). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** iOS Safari cannot reliably print part of a web page, so open the server's PDF instead: its Share button has Print.
 *  Call this straight from the tap, before any await, so Safari allows the new tab. */
export async function openPdfToPrint(file: () => Promise<{ blob: Blob; filename: string }>): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const { blob, filename } = await file();
    const pdf = new Blob([blob], { type: "application/pdf" });
    if (!tab) { saveFile(pdf, filename); return; } // new tabs blocked: iOS shows the downloaded PDF, which also has Share → Print
    const url = URL.createObjectURL(pdf);
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
