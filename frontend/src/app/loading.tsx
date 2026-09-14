import { PageLoader } from "@/components/ui/PageLoader";
import { siteConfig } from "@/lib/config";

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label={siteConfig.name} sub="Loading your business dashboard" />
    </div>
  );
}
