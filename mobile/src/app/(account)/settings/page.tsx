"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MobileSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account");
  }, [router]);

  return (
    <div className="min-h-full flex items-center justify-center">
      <p className="text-[13px] text-muted">Redirecting to Account…</p>
    </div>
  );
}
