import { PageLoader } from "@/components/ui/PageLoader";

export default function Loading() {
  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-6">
      <PageLoader variant="compact" />
    </div>
  );
}
