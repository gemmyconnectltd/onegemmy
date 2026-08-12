"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const supported = "BarcodeDetector" in window;
    if (!supported) {
      setError("Camera scanner not supported in this browser. Use manual entry below.");
      return;
    }

    let active = true;

    async function start() {
      try {
        // @ts-ignore
        detectorRef.current = new BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scan();
      } catch {
        setError("Camera access denied. Use manual entry below.");
      }
    }

    async function scan() {
      if (!active || !videoRef.current || !detectorRef.current) return;
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length > 0) {
          onScan(barcodes[0].rawValue);
          return;
        }
      } catch { /* continue */ }
      rafRef.current = requestAnimationFrame(scan);
    }

    start();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ScanLine size={16} className="text-primary" /> Scan Barcode
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {!error && (
          <div className="relative bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-24 border-2 border-primary rounded-lg opacity-80" />
            </div>
          </div>
        )}

        {error && (
          <p className="px-4 py-3 text-sm text-amber-600 bg-amber-50">{error}</p>
        )}

        <div className="p-4 space-y-2">
          <p className="text-xs text-muted font-semibold uppercase tracking-wide">Manual entry</p>
          <div className="flex gap-2">
            <input
              autoFocus={!!error}
              type="text"
              placeholder="Type or paste barcode…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualInput.trim()) {
                  onScan(manualInput.trim());
                }
              }}
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => { if (manualInput.trim()) onScan(manualInput.trim()); }}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
