"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-fit max-w-[398px]">
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-foreground text-background text-xs font-medium shadow-lg shadow-black/20">
        <WifiOff size={13} className="flex-shrink-0" />
        You&apos;re offline — showing cached data
      </div>
    </div>
  );
}
