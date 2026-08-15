import { PageLoader } from "@/components/ui/PageLoader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label="OneGemmy" sub="Loading the till" />
    </div>
  );
}
